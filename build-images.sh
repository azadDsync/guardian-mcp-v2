#!/bin/bash

# Guardian MCP - Docker Build Script
# Builds all 4 MCP servers as Docker images

set -e

echo "🛡️  Guardian MCP - Building Docker Images"
echo "========================================"
echo ""

cd "$(dirname "$0")"

# Build Maps MCP
echo "📦 Building Guardian Maps MCP..."
docker build -t guardian-maps-mcp:latest ./maps-mcp
echo "✅ Maps MCP built"
echo ""

# Build Weather MCP
echo "📦 Building Guardian Weather MCP..."
docker build -t guardian-weather-mcp:latest ./weather-mcp
echo "✅ Weather MCP built"
echo ""

# Build Vision MCP
echo "📦 Building Guardian Vision MCP..."
docker build -t guardian-vision-mcp:latest ./vision-mcp
echo "✅ Vision MCP built"
echo ""

# Build Safety MCP
echo "📦 Building Guardian Safety MCP..."
docker build -t guardian-safety-mcp:latest ./safety-mcp
echo "✅ Safety MCP built"
echo ""

# Show built images
echo "📋 Built Images:"
docker images | grep guardian

echo ""
echo "✨ All images built successfully!"
echo ""
echo "Next steps:"
echo "1. If using KinD, load images: ./load-to-kind.sh"
echo "2. Configure in Archestra UI (see ARCHESTRA_SETUP.md)"
