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

// Google Maps Provider
class GoogleMapsProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async getWalkingRoute(originLat, originLng, destLat, destLng) {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.append('origin', `${originLat},${originLng}`);
    url.searchParams.append('destination', `${destLat},${destLng}`);
    url.searchParams.append('mode', 'walking');
    url.searchParams.append('key', this.apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found');
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const steps = leg.steps.map(step =>
      step.html_instructions.replace(/<[^>]*>/g, '')
    );

    const allInstructions = steps.join(' ').toLowerCase();
    const includesAlley = allInstructions.includes('alley') || allInstructions.includes('alleyway');
    const poorlyLitAreaEstimate = allInstructions.includes('alley') || allInstructions.includes('underpass') ||
                                   allInstructions.includes('tunnel') || allInstructions.includes('parking');
    const includesStairs = allInstructions.includes('stairs') || allInstructions.includes('steps');

    return {
      polyline: route.overview_polyline.points,
      steps,
      distance_meters: leg.distance.value,
      duration_seconds: leg.duration.value,
      route_features: {
        includes_alley: includesAlley,
        poorly_lit_area_estimate: poorlyLitAreaEstimate,
        includes_stairs: includesStairs,
        has_crosswalks: allInstructions.includes('cross'),
      },
    };
  }
}

// MCP Server
class MapsServer {
  constructor() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY environment variable is required');
    }

    this.provider = new GoogleMapsProvider(apiKey);
    this.server = new Server(
      { name: 'guardian-maps-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    console.error('[Maps MCP] Using Google Maps API');
    this.setupHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: 'get_walking_route',
        description: 'Get walking route from origin to destination with safety features analysis',
        inputSchema: {
          type: 'object',
          properties: {
            origin_lat: { type: 'number', description: 'Origin latitude (-90 to 90)', minimum: -90, maximum: 90 },
            origin_lng: { type: 'number', description: 'Origin longitude (-180 to 180)', minimum: -180, maximum: 180 },
            dest_lat: { type: 'number', description: 'Destination latitude (-90 to 90)', minimum: -90, maximum: 90 },
            dest_lng: { type: 'number', description: 'Destination longitude (-180 to 180)', minimum: -180, maximum: 180 },
          },
          required: ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng'],
        },
      }],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'get_walking_route') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const startTime = Date.now();
      const correlationId = generateCorrelationId();

      try {
        const args = request.params.arguments;
        console.error(`[Maps MCP] Processing request ${correlationId}`);
        console.error(`[Maps MCP] Origin: ${args.origin_lat}, ${args.origin_lng}`);
        console.error(`[Maps MCP] Destination: ${args.dest_lat}, ${args.dest_lng}`);

        const result = await this.provider.getWalkingRoute(
          args.origin_lat, args.origin_lng, args.dest_lat, args.dest_lng
        );

        const response = {
          ...result,
          execution_time_ms: Date.now() - startTime,
          correlation_id: correlationId,
          timestamp: getCurrentTimestamp(),
        };

        console.error(`[Maps MCP] Success: ${response.distance_meters}m route in ${response.execution_time_ms}ms`);

        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Maps MCP] Error: ${errorMessage}`);

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
    console.error('Guardian Maps MCP server running on stdio');
  }
}

const server = new MapsServer();
server.run().catch(console.error);
