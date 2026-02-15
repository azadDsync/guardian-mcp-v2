#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Utilities
function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

// Safety Scorer
class SafetyScorer {
  static calculateSafetyScore(hazards, weatherCondition, visibility, precipitation, windSpeed, routeIncludesAlley, routePoorlyLit, timeOfDay) {
    let score = 100;

    const hazardPenalty = this.calculateHazardPenalty(hazards);
    score -= hazardPenalty;

    const weatherPenalty = this.calculateWeatherPenalty(weatherCondition, visibility, precipitation, windSpeed);
    score -= weatherPenalty;

    const routePenalty = this.calculateRoutePenalty(routeIncludesAlley, routePoorlyLit);
    score -= routePenalty;

    const timeOfDayPenalty = this.calculateTimeOfDayPenalty(timeOfDay);
    score -= timeOfDayPenalty;

    return {
      baseScore: 100,
      hazardPenalty,
      weatherPenalty,
      routePenalty,
      timeOfDayPenalty,
      finalScore: Math.max(0, Math.min(100, score)),
    };
  }

  static calculateHazardPenalty(hazards) {
    if (!hazards || hazards.length === 0) {
      return 0;
    }

    let penalty = 0;

    for (const hazard of hazards) {
      const hazardImpact = hazard.severity * hazard.confidence * 40;
      penalty += hazardImpact;
    }

    if (hazards.length > 1) {
      const compoundingFactor = 1 + (hazards.length - 1) * 0.1;
      penalty *= compoundingFactor;
    }

    return Math.min(40, penalty);
  }

  static calculateWeatherPenalty(condition, visibility, precipitation, windSpeed) {
    let penalty = 0;

    const conditionLower = condition.toLowerCase();
    if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) {
      penalty += 8;
    } else if (conditionLower.includes('snow')) {
      penalty += 12;
    } else if (conditionLower.includes('fog') || conditionLower.includes('mist')) {
      penalty += 10;
    } else if (conditionLower.includes('thunderstorm')) {
      penalty += 15;
    }

    if (visibility < 1000) {
      const visibilityPenalty = Math.min(8, (1000 - visibility) / 100);
      penalty += visibilityPenalty;
    }

    if (precipitation > 0) {
      const precipPenalty = Math.min(7, precipitation * 2);
      penalty += precipPenalty;
    }

    if (windSpeed > 10) {
      const windPenalty = Math.min(5, (windSpeed - 10) * 0.5);
      penalty += windPenalty;
    }

    return Math.min(30, penalty);
  }

  static calculateRoutePenalty(includesAlley, poorlyLit) {
    let penalty = 0;
    if (includesAlley) penalty += 10;
    if (poorlyLit) penalty += 10;
    return penalty;
  }

  static calculateTimeOfDayPenalty(timeOfDay) {
    switch (timeOfDay) {
      case 'morning':
        return 0;
      case 'afternoon':
        return 0;
      case 'evening':
        return 5;
      case 'night':
        return 10;
      default:
        return 0;
    }
  }

  static getRecommendation(score) {
    if (score >= 70) {
      return 'continue';
    } else if (score >= 40) {
      return 'reroute';
    } else {
      return 'high_risk';
    }
  }

  static getExplanation(score, recommendation, components) {
    const explanations = [];

    explanations.push(`Overall safety score: ${score.toFixed(1)}/100`);
    explanations.push(`Breakdown: Base(${components.baseScore}) - Hazards(${components.hazardPenalty.toFixed(1)}) - Weather(${components.weatherPenalty.toFixed(1)}) - Route(${components.routePenalty.toFixed(1)}) - Time(${components.timeOfDayPenalty.toFixed(1)})`);

    if (recommendation === 'continue') {
      explanations.push('✓ Route is reasonably safe to proceed');
    } else if (recommendation === 'reroute') {
      explanations.push('⚠ Moderate risk detected - consider alternative route');
    } else {
      explanations.push('⛔ High risk detected - strongly recommend alternative route or delay');
    }

    return explanations.join('\n');
  }
}

// Safety Server
class SafetyServer {
  constructor() {
    this.server = new Server(
      { name: 'guardian-safety-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    console.error('[Safety MCP] Safety scoring engine initialized');
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
        name: 'evaluate_safety',
        description: 'Evaluate overall safety score based on route, hazards, weather, and time of day',
        inputSchema: {
          type: 'object',
          properties: {
            route_data: {
              type: 'object',
              description: 'Walking route information from Maps MCP',
              properties: {
                polyline: { type: 'string' },
                steps: { type: 'array', items: { type: 'string' } },
                distance_meters: { type: 'number' },
                duration_seconds: { type: 'number' },
                route_features: {
                  type: 'object',
                  properties: {
                    includes_alley: { type: 'boolean' },
                    poorly_lit_area_estimate: { type: 'boolean' },
                  },
                  required: ['includes_alley', 'poorly_lit_area_estimate'],
                },
              },
              required: ['polyline', 'steps', 'distance_meters', 'duration_seconds', 'route_features'],
            },
            hazards: {
              type: 'array',
              description: 'Optional array of hazards from Vision MCP',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  confidence: { type: 'number' },
                  severity: { type: 'number' },
                  description: { type: 'string' },
                },
              },
            },
            weather_data: {
              type: 'object',
              description: 'Weather conditions from Weather MCP',
              properties: {
                condition: { type: 'string' },
                temperature: { type: 'number' },
                visibility_meters: { type: 'number' },
                precipitation: { type: 'number' },
                wind_speed: { type: 'number' },
              },
              required: ['condition', 'temperature', 'visibility_meters', 'precipitation', 'wind_speed'],
            },
            time_of_day: {
              type: 'string',
              enum: ['morning', 'afternoon', 'evening', 'night'],
              description: 'Current time of day',
            },
          },
          required: ['route_data', 'weather_data', 'time_of_day'],
        },
      }],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'evaluate_safety') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const startTime = Date.now();
      const correlationId = generateCorrelationId();

      try {
        const args = request.params.arguments;

        console.error(`[Safety MCP] Processing request ${correlationId}`);
        console.error(`[Safety MCP] Route: ${args.route_data.distance_meters}m, Hazards: ${args.hazards?.length || 0}, Weather: ${args.weather_data.condition}`);

        const riskBreakdown = [];

        const scoreComponents = SafetyScorer.calculateSafetyScore(
          args.hazards || [],
          args.weather_data.condition,
          args.weather_data.visibility_meters,
          args.weather_data.precipitation,
          args.weather_data.wind_speed,
          args.route_data.route_features.includes_alley,
          args.route_data.route_features.poorly_lit_area_estimate,
          args.time_of_day
        );

        const safetyScore = scoreComponents.finalScore;
        const recommendation = SafetyScorer.getRecommendation(safetyScore);
        const explanation = SafetyScorer.getExplanation(safetyScore, recommendation, scoreComponents);

        if (args.hazards && args.hazards.length > 0) {
          for (const hazard of args.hazards) {
            const severityLabel = hazard.severity > 0.7 ? 'High' : hazard.severity > 0.4 ? 'Medium' : 'Low';
            riskBreakdown.push(`${hazard.type.replace(/_/g, ' ')} (${severityLabel} severity, ${Math.round(hazard.confidence * 100)}% confidence)`);
          }
        }

        if (args.weather_data.condition.toLowerCase() !== 'clear') {
          riskBreakdown.push(`Weather: ${args.weather_data.condition}`);
        }

        if (args.weather_data.visibility_meters < 1000) {
          riskBreakdown.push(`Low visibility: ${args.weather_data.visibility_meters}m`);
        }

        if (args.route_data.route_features.includes_alley) {
          riskBreakdown.push('Route includes alley or narrow passage');
        }

        if (args.route_data.route_features.poorly_lit_area_estimate) {
          riskBreakdown.push('Route includes poorly lit areas');
        }

        if (args.time_of_day === 'night' || args.time_of_day === 'evening') {
          riskBreakdown.push(`${args.time_of_day} time reduces visibility`);
        }

        const result = {
          safety_score: Math.round(safetyScore * 100) / 100,
          risk_breakdown: riskBreakdown,
          recommendation,
          explanation,
          execution_time_ms: Date.now() - startTime,
          correlation_id: correlationId,
          timestamp: getCurrentTimestamp(),
        };

        console.error(`[Safety MCP] Success: Score ${result.safety_score}/100, Recommendation: ${recommendation} in ${result.execution_time_ms}ms`);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Safety MCP] Error: ${errorMessage}`);

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
    console.error('Guardian Safety MCP server running on stdio');
  }
}

const server = new SafetyServer();
server.run().catch(console.error);
