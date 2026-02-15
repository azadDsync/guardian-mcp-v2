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

// Weather Server
class WeatherServer {
  constructor() {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENWEATHER_API_KEY environment variable is required');
    }

    this.apiKey = apiKey;
    this.server = new Server(
      { name: 'guardian-weather-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    console.error('[Weather MCP] Using OpenWeather API');
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
        name: 'get_weather',
        description: 'Get current weather conditions at a specific location',
        inputSchema: {
          type: 'object',
          properties: {
            lat: { type: 'number', description: 'Latitude (-90 to 90)', minimum: -90, maximum: 90 },
            lng: { type: 'number', description: 'Longitude (-180 to 180)', minimum: -180, maximum: 180 },
          },
          required: ['lat', 'lng'],
        },
      }],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'get_weather') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const startTime = Date.now();
      const correlationId = generateCorrelationId();

      try {
        const args = request.params.arguments;
        console.error(`[Weather MCP] Processing request ${correlationId}`);
        console.error(`[Weather MCP] Location: ${args.lat}, ${args.lng}`);

        const url = new URL('https://api.openweathermap.org/data/2.5/weather');
        url.searchParams.append('lat', args.lat.toString());
        url.searchParams.append('lon', args.lng.toString());
        url.searchParams.append('appid', this.apiKey);
        url.searchParams.append('units', 'metric');

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`OpenWeather API error: ${response.statusText}`);
        }

        const data = await response.json();
        const precipitation = (data.rain?.['1h'] || 0) + (data.snow?.['1h'] || 0);

        const result = {
          condition: data.weather[0]?.main || 'Unknown',
          temperature: data.main.temp,
          visibility_meters: data.visibility || 10000,
          precipitation,
          wind_speed: data.wind.speed,
          description: data.weather[0]?.description,
          execution_time_ms: Date.now() - startTime,
          correlation_id: correlationId,
          timestamp: getCurrentTimestamp(),
        };

        console.error(`[Weather MCP] Success: ${result.condition} at ${result.temperature}°C in ${result.execution_time_ms}ms`);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Weather MCP] Error: ${errorMessage}`);

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
    console.error('Guardian Weather MCP server running on stdio');
  }
}

const server = new WeatherServer();
server.run().catch(console.error);
