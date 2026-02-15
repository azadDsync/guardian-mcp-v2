#!/bin/bash

# Guardian MCP - Load Images to KinD Cluster
# Loads Docker images into Archestra's embedded Kubernetes cluster

set -e

echo "🛡️  Guardian MCP - Loading Images to KinD"
echo "========================================"
echo ""

# Find Archestra container
ARCHESTRA_CONTAINER=$(docker ps --filter "ancestor=archestra/platform" --format "{{.Names}}" | head -n 1)

if [ -z "$ARCHESTRA_CONTAINER" ]; then
    echo "❌ Archestra container not found!"
    echo ""
    echo "Please start Archestra first:"
    echo "  docker run -d -p 3000:3000 --name archestra archestra/platform:latest"
    exit 1
fi

echo "Found Archestra container: $ARCHESTRA_CONTAINER"
echo ""

# KinD cluster name (inside Archestra container)
CLUSTER_NAME="archestra-mcp"

# Verify cluster exists
echo "Verifying KinD cluster..."
if ! docker exec "$ARCHESTRA_CONTAINER" kind get clusters | grep -q "$CLUSTER_NAME"; then
    echo "⚠️  KinD cluster '$CLUSTER_NAME' not found inside Archestra container."
    echo ""
    echo "Available clusters:"
    docker exec "$ARCHESTRA_CONTAINER" kind get clusters
    exit 1
fi

echo "✓ Cluster '$CLUSTER_NAME' found"
echo ""

# Load images into KinD cluster (inside Archestra container)
echo "📦 Loading guardian-maps-mcp:latest..."
docker exec "$ARCHESTRA_CONTAINER" kind load docker-image guardian-maps-mcp:latest --name "$CLUSTER_NAME"
echo "✅ Maps MCP loaded"
echo ""

echo "📦 Loading guardian-weather-mcp:latest..."
docker exec "$ARCHESTRA_CONTAINER" kind load docker-image guardian-weather-mcp:latest --name "$CLUSTER_NAME"
echo "✅ Weather MCP loaded"
echo ""

echo "📦 Loading guardian-vision-mcp:latest..."
docker exec "$ARCHESTRA_CONTAINER" kind load docker-image guardian-vision-mcp:latest --name "$CLUSTER_NAME"
echo "✅ Vision MCP loaded"
echo ""

echo "📦 Loading guardian-safety-mcp:latest..."
docker exec "$ARCHESTRA_CONTAINER" kind load docker-image guardian-safety-mcp:latest --name "$CLUSTER_NAME"
echo "✅ Safety MCP loaded"
echo ""

echo "✨ All images loaded to KinD cluster!"
echo ""
echo "Next step: Configure servers in Archestra UI"
echo "Go to: http://localhost:3000"
