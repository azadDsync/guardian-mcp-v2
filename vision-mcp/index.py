#!/usr/bin/env python3
"""
Guardian Vision MCP - Hybrid Object Detection + Condition Analysis
Combines YOLOv8 (physical hazards) + Moondream2 (environmental conditions)
"""
import asyncio
import logging
import sys
import json
from datetime import datetime
from mcp.server import Server
from mcp.types import Tool, TextContent
from yolo_detector import YOLODetector
from condition_analyzer import ConditionAnalyzer

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger('vision-mcp')


def generate_correlation_id():
    return f"{int(datetime.now().timestamp() * 1000)}-{id(object())}"


class VisionMCPServer:
    def __init__(self):
        self.server = Server("guardian-vision-mcp")
        self.yolo = YOLODetector(model_size='n')  # nano model for speed
        self.moondream = ConditionAnalyzer()
        
        # Register handlers
        self.setup_handlers()
        
        logger.info("Guardian Vision MCP initialized")
        logger.info("  - YOLOv8: Physical object detection")
        logger.info("  - Moondream2: Environmental condition analysis")
    
    def setup_handlers(self):
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return [
                Tool(
                    name="detect_objects",
                    description=(
                        "Detect physical objects and hazards in an image using YOLO. "
                        "Identifies: vehicles, construction equipment, obstacles, people, animals, signs. "
                        "Returns concrete objects with counts and mapped safety hazards."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "image_url": {
                                "type": "string",
                                "description": "URL of the image to analyze",
                                "format": "uri"
                            },
                            "image_base64": {
                                "type": "string",
                                "description": "Base64-encoded image data (data URL or raw base64)"
                            },
                            "image_headers": {
                                "type": "object",
                                "description": "Optional headers for image_url requests",
                                "additionalProperties": {"type": "string"}
                            }
                        },
                        "anyOf": [
                            {"required": ["image_url"]},
                            {"required": ["image_base64"]}
                        ]
                    }
                ),
                Tool(
                    name="analyze_conditions",
                    description=(
                        "Analyze environmental conditions in an image using Moondream2 Vision. "
                        "Detects: lighting quality, weather visibility, wet surfaces, area maintenance, isolation. "
                        "Returns abstract environmental hazards affecting pedestrian safety."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "image_url": {
                                "type": "string",
                                "description": "URL of the image to analyze",
                                "format": "uri"
                            },
                            "image_base64": {
                                "type": "string",
                                "description": "Base64-encoded image data (data URL or raw base64)"
                            },
                            "image_headers": {
                                "type": "object",
                                "description": "Optional headers for image_url requests",
                                "additionalProperties": {"type": "string"}
                            }
                        },
                        "anyOf": [
                            {"required": ["image_url"]},
                            {"required": ["image_base64"]}
                        ]
                    }
                )
            ]
        
        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            correlation_id = generate_correlation_id()
            start_time = datetime.now()
            
            try:
                image_url = arguments.get('image_url')
                image_base64 = arguments.get('image_base64')
                image_headers = arguments.get('image_headers')
                if not image_url and not image_base64:
                    raise ValueError("image_url or image_base64 is required")
                
                image_ref = image_url or "<base64>"
                logger.info(f"[{correlation_id}] Processing {name} for {image_ref}")
                
                if name == "detect_objects":
                    result = self.yolo.detect(
                        image_url=image_url,
                        image_base64=image_base64,
                        image_headers=image_headers
                    )
                    result['correlation_id'] = correlation_id
                    result['timestamp'] = start_time.isoformat()
                    result['tool'] = 'yolo_detector'
                    
                    logger.info(
                        f"[{correlation_id}] YOLO: "
                        f"{result['total_objects']} objects, "
                        f"{len(result['hazards'])} hazards, "
                        f"{result['detection_time_ms']}ms"
                    )
                    
                    return [TextContent(
                        type="text",
                        text=json.dumps(result, indent=2)
                    )]
                
                elif name == "analyze_conditions":
                    result = self.moondream.analyze(
                        image_url=image_url,
                        image_base64=image_base64,
                        image_headers=image_headers
                    )
                    result['correlation_id'] = correlation_id
                    result['timestamp'] = start_time.isoformat()
                    result['tool'] = 'moondream2_vision'
                    
                    logger.info(
                        f"[{correlation_id}] Moondream2: "
                        f"{len(result['hazards'])} hazards, "
                        f"{result['analysis_time_ms']}ms"
                    )
                    
                    return [TextContent(
                        type="text",
                        text=json.dumps(result, indent=2)
                    )]
                
                else:
                    raise ValueError(f"Unknown tool: {name}")
                
            except Exception as e:
                logger.error(f"[{correlation_id}] Error: {e}", exc_info=True)
                
                error_result = {
                    'error': str(e),
                    'correlation_id': correlation_id,
                    'timestamp': start_time.isoformat(),
                    'execution_time_ms': int((datetime.now() - start_time).total_seconds() * 1000)
                }
                
                return [TextContent(
                    type="text",
                    text=json.dumps(error_result, indent=2)
                )]
    
    async def run(self):
        """Run the MCP server on stdio"""
        from mcp.server.stdio import stdio_server
        
        async with stdio_server() as (read_stream, write_stream):
            logger.info("Guardian Vision MCP server running on stdio")
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options()
            )


def main():
    server = VisionMCPServer()
    asyncio.run(server.run())


if __name__ == "__main__":
    main()
