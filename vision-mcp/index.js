#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// Utilities
function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

// Vision Server
class VisionServer {
  constructor() {
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_CLOUD_VISION_API_KEY environment variable is required');
    }

    this.apiKey = apiKey;
    this.server = new Server(
      { name: 'guardian-vision-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    console.error('[Vision MCP] Using Google Cloud Vision API');
    this.setupHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async analyzeImageWithGoogleVision(imageInput) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;

    let requestBody;
    if (imageInput.startsWith('data:image/')) {
      // Base64: extract data
      const matches = imageInput.match(/^data:([^;]+);base64,(.*)$/);
      if (!matches) {
        throw new Error('Invalid base64 image format');
      }
      const base64Data = matches[2];
      
      // Size check (20MB max for Vision API)
      if (base64Data.length > 20 * 1024 * 1024 * 4 / 3) {  // ~20MB decoded
        throw new Error('Image too large (max 20MB)');
      }

      requestBody = {
        requests: [{
          image: { content: base64Data },  // Raw base64 content
          features: [{ type: 'LABEL_DETECTION', maxResults: 20 }],
        }],
      };
      console.error(`[Vision MCP] Processing base64 image (${base64Data.length} chars)`);
    } else {
      // URL
      requestBody = {
        requests: [{
          image: { source: { imageUri: imageInput } },
          features: [{ type: 'LABEL_DETECTION', maxResults: 20 }],
        }],
      };
      console.error(`[Vision MCP] Processing URL: ${imageInput}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Cloud Vision API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const result = data.responses[0];

    if (result.error) {
      throw new Error(`Google Cloud Vision error: ${result.error.message}`);
    }

    const hazards = [];
    const labels = result.labelAnnotations || [];
    const labelTexts = labels.map(l => l.description.toLowerCase()).join(' ');

    const findMaxConfidence = (keywords) => {
      let maxScore = 0.5;
      for (const label of labels) {
        for (const keyword of keywords) {
          if (label.description.toLowerCase().includes(keyword)) {
            maxScore = Math.max(maxScore, label.score);
          }
        }
      }
      return maxScore;
    };

    // Hazard detection rules (unchanged)
    if (labelTexts.includes('construction') || labelTexts.includes('barrier') || labelTexts.includes('caution') || labelTexts.includes('warning')) {
      hazards.push({
        type: 'construction',
        confidence: findMaxConfidence(['construction', 'barrier', 'caution', 'warning']),
        severity: 0.7,
        description: 'Construction zone or barrier detected',
        location: 'Image area'
      });
    }

    if (labelTexts.includes('water') || labelTexts.includes('rain') || labelTexts.includes('wet') || labelTexts.includes('puddle')) {
      hazards.push({
        type: 'wet_floor',
        confidence: findMaxConfidence(['water', 'rain', 'wet', 'puddle']),
        severity: 0.5,
        description: 'Wet surface or water detected',
        location: 'Ground level'
      });
    }

    if (labelTexts.includes('darkness') || labelTexts.includes('night') || labelTexts.includes('shadow') || labelTexts.includes('dark')) {
      hazards.push({
        type: 'poorly_lit',
        confidence: findMaxConfidence(['darkness', 'night', 'shadow', 'dark']),
        severity: 0.6,
        description: 'Poor lighting conditions detected',
        location: 'Overall scene'
      });
    }

    if (labelTexts.includes('debris') || labelTexts.includes('trash') || labelTexts.includes('obstacle') || labelTexts.includes('garbage')) {
      hazards.push({
        type: 'debris',
        confidence: findMaxConfidence(['debris', 'trash', 'obstacle', 'garbage']),
        severity: 0.45,
        description: 'Debris or obstacles detected',
        location: 'Pathway'
      });
    }

    if (labelTexts.includes('fog') || labelTexts.includes('mist') || labelTexts.includes('haze') || labelTexts.includes('smoke')) {
      hazards.push({
        type: 'low_visibility',
        confidence: findMaxConfidence(['fog', 'mist', 'haze', 'smoke']),
        severity: 0.65,
        description: 'Low visibility conditions',
        location: 'Overall scene'
      });
    }

    if (labelTexts.includes('closed') || labelTexts.includes('blocked')) {
      hazards.push({
        type: 'road_closed',
        confidence: findMaxConfidence(['closed', 'blocked']),
        severity: 0.9,
        description: 'Road closure or blockage detected',
        location: 'Route'
      });
    }

    console.error(`[Vision MCP] Google Vision detected ${hazards.length} hazards from ${labels.length} labels`);
    return hazards;
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: 'analyze_image',
        description: 'Analyze an image for safety hazards using Google Cloud Vision. Supports URLs and base64 from chat uploads.',
        inputSchema: {
          type: 'object',
          properties: {
            image_url: { 
              type: 'string', 
              description: 'Public URL of the image to analyze (preferred for web images)', 
              format: 'uri' 
            },
            image_base64: { 
              type: 'string', 
              description: 'Base64-encoded image data: data:image/png;base64,... or raw base64 (for Archestra chat uploads)' 
            },
            image_mime_type: { 
              type: 'string', 
              description: 'MIME type if providing raw base64 (e.g., image/png). Defaults to image/png.' 
            },
          },
          required: ['image_url'],  // Keep backward compatible, base64 is optional fallback
        },
      }],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'analyze_image') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const startTime = Date.now();
      const correlationId = generateCorrelationId();

      try {
        const args = request.params.arguments;
        console.error(`[Vision MCP] Processing request ${correlationId}`);

        // Smart image source selection
        let imageInput;
        if (args.image_base64) {
          // Archestra/chat format
          imageInput = args.image_base64.startsWith('data:image/') 
            ? args.image_base64 
            : `data:${args.image_mime_type || 'image/png'};base64,${args.image_base64}`;
          console.error(`[Vision MCP] Using base64 image`);
        } else if (args.image_url) {
          // URL format
          imageInput = args.image_url;
          console.error(`[Vision MCP] Using URL image: ${imageInput}`);
        } else {
          throw new Error('Must provide image_url or image_base64');
        }

        const hazards = await this.analyzeImageWithGoogleVision(imageInput);

        const result = {
          hazards,
          execution_time_ms: Date.now() - startTime,
          correlation_id: correlationId,
          timestamp: getCurrentTimestamp(),
          model_used: 'google-cloud-vision',
          input_type: imageInput.startsWith('data:image/') ? 'base64' : 'url',
        };

        console.error(`[Vision MCP] Success: Found ${hazards.length} hazards in ${result.execution_time_ms}ms`);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Vision MCP] Error ${correlationId}: ${errorMessage}`);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: errorMessage,
              execution_time_ms: Date.now() - startTime,
              correlation_id: correlationId,
              timestamp: getCurrentTimestamp(),
            }, null, 2),
          }],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🛡️ Guardian Vision MCP server running on stdio (URLs + Base64 support)');
  }
}

const server = new VisionServer();
server.run().catch(console.error);
