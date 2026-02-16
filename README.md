# 🛡️ Guardian MCP - Context-Aware Safety Escort

> Production-grade MCP system for pedestrian safety assessment using real-time data from Google Maps, OpenWeather, YOLOv8, and Moondream2 Vision AI.



---

## 🎯 What It Does

Guardian MCP provides intelligent pedestrian safety assessment by:
- **Route Analysis**: Fetches walking routes with safety feature detection (alleys, poor lighting, stairs)
- **Weather Monitoring**: Real-time weather conditions and visibility
- **Hazard Detection**: Hybrid AI vision - YOLOv8 for objects + Moondream2 for environmental conditions
- **Safety Scoring**: Algorithmic 0-100 safety score with transparent reasoning

### Example Interaction
<img width="1777" height="959" alt="Screenshot from 2026-02-16 19-34-40" src="https://github.com/user-attachments/assets/f78574b6-5ea7-400a-ab93-48a5045dcb1a" />
<img width="1777" height="959" alt="Screenshot from 2026-02-16 19-34-50" src="https://github.com/user-attachments/assets/383cfb07-4053-425e-9bb5-4166efa5c8aa" />

```
👤 User: I'm at 40.7128, -74.0060. Take me to 40.7580, -73.9855. It's 10 PM.

🤖 Guardian Agent:
→ Calls get_walking_route() via Maps MCP
→ Calls get_weather() via Weather MCP
→ Calls evaluate_safety() via Safety MCP

🛡️ Safety Assessment:
Route: 3.2 km, 41 minutes walking
Weather: Clear, 68°F, visibility 10km
Route Features: ⚠️ Includes poorly lit areas
Time: Night (high risk period)

Safety Score: 62/100 (MODERATE RISK)
Recommendation: Proceed with caution. Stay alert in poorly lit areas.
```

---

## 📦 Architecture

### Four Independent MCP Servers

```
guardian-mcp-v2/
├── maps-mcp/           Google Maps Directions API
│   ├── index.js        Route fetching + safety feature detection
│   ├── package.json
│   └── Dockerfile
│
├── weather-mcp/        OpenWeather API
│   ├── index.js        Real-time weather conditions
│   ├── package.json
│   └── Dockerfile
│
├── vision-mcp/         Google Cloud Vision MCP (primary)
│   ├── index.js        MCP server (Node.js, Cloud Vision API)
│   ├── package.json
│   └── Dockerfile
│
├── local-vision-mcp/   Local YOLOv8 + Moondream2 Vision (optional)
│   ├── index.py                MCP server (Python)
│   ├── yolo_detector.py        Object detection 
│   ├── condition_analyzer.py   Environmental analysis 
│   ├── requirements.txt        Python dependencies
│   └── Dockerfile            
│
└── safety-mcp/         Algorithmic Safety Scoring
    ├── index.js        
    ├── package.json
    └── Dockerfile
```

### Technology Stack

- **Language**: JavaScript (Maps, Weather, Safety, Cloud Vision) + Python (Local Vision)
- **Runtime**: Node.js 20+ (JS services + Google Cloud Vision MCP) + Python 3.11 (local YOLO+Moondream MCP)
- **Vision AI**:
  - **Cloud Vision**: Google Cloud Vision API (label detection) via `vision-mcp/`
  - **Local Vision (optional)**: YOLOv8 Nano (Ultralytics) + Moondream2 (vikhyatk) via `local-vision-mcp/`
- **Framework**: @modelcontextprotocol/sdk v1.0.4 (JS) + mcp v1.1.2 (Python)
- **Transport**: stdio (JSON-RPC over stdin/stdout)
- **Deployment**: Docker containers in Kubernetes

---

## 🔑 Prerequisites

### 1. API Keys Setup

#### Google Maps Directions API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project or select existing
3. Enable **"Directions API"**
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy the key (format: `AIzaSyC-xxxxxxxxxxxxxxxxxxxxx`)

#### OpenWeather API
1. Go to [OpenWeather](https://openweathermap.org/api)
2. Sign up for free account
3. Get API key from dashboard
4. Free tier: 1000 calls/day

#### Vision AI Options

You can run Guardian with either **Google Cloud Vision** (fast, managed, requires API key) or an optional **local YOLOv8 + Moondream2** stack (100% local, heavier).

##### A) Google Cloud Vision API (default `vision-mcp/`)

- Requires a Google Cloud project + **Vision API** enabled
- Uses `GOOGLE_CLOUD_VISION_API_KEY`
- Has a generous free tier (see [Vision pricing](https://cloud.google.com/vision/pricing))

##### B) Local Vision (YOLOv8 + Moondream2) - 100% FREE!
**No external APIs required.** Models download automatically:
- **YOLOv8 Nano** (~6MB) - Pre-downloaded during build
- **Moondream2** (~1.6GB) - Downloads on first container start

**Optimizations applied:**
- CPU-only PyTorch (saves ~1.5GB vs full version)
- Aggressive cache cleanup during build
- Lazy loading: Moondream2 downloads at runtime (not build time)
- **Base image size: 1.65GB** (final runtime: ~3.2GB after first start)
- Build time: ~5 minutes (vs 20+ minutes with pre-download)

No API keys, no external services, runs entirely locally in the container.

### 2. Hardware Requirements (Local Vision MCP)

**Local Vision MCP** (`local-vision-mcp/`, YOLOv8 + Moondream2, optimized for CPU inference):
- **RAM**: 4GB minimum, 6GB recommended (for Moondream2 inference)
- **Storage**: 3.5GB total (1.65GB image + 1.6GB model download + overhead)
- **CPU**: 2+ cores recommended (inference ~300-800ms per image)
- **Note**: Runs on CPU-only, no GPU required!
- **First Start**: Moondream2 downloads automatically (~2 minutes)

Other MCPs are lightweight (< 200MB RAM each).

### 3. Archestra Platform

```bash
# Pull and run Archestra
docker pull archestra/platform:latest
docker run -d -p 3000:3000 --name archestra archestra/platform:latest

# Access UI
open http://localhost:3000
```

---

## 🚀 Installation & Deployment

### Step 1: Build Docker Images

```bash
cd /home/azad/Desktop/Hackathon/guardian-mcp-v2

# Build all 4 images
./build-images.sh
```

**Expected output:**
```
✅ Maps MCP built: guardian-maps-mcp:latest
✅ Weather MCP built: guardian-weather-mcp:latest
✅ Vision MCP built: guardian-vision-mcp:latest
✅ Safety MCP built: guardian-safety-mcp:latest
```

### Step 2: Load Images into Archestra's Kubernetes Cluster
```bash
cd /home/azad/Desktop/Hackathon/guardian-mcp-v2

# load all 4 images to cluster
./build-images.sh
```

**Important:** Archestra runs an embedded Kubernetes (KinD) cluster inside its Docker container. You need to load your custom images into this cluster.

```bash
# Find Archestra container name
docker ps --filter "ancestor=archestra/platform" --format "{{.Names}}"
# Output: vigilant_payne (or similar)

# Load all 4 images (replace 'vigilant_payne' with your container name)
docker exec vigilant_payne kind load docker-image guardian-maps-mcp:latest --name archestra-mcp
docker exec vigilant_payne kind load docker-image guardian-weather-mcp:latest --name archestra-mcp
docker exec vigilant_payne kind load docker-image guardian-vision-mcp:latest --name archestra-mcp
docker exec vigilant_payne kind load docker-image guardian-safety-mcp:latest --name archestra-mcp
```

**Expected output for each:**
```
Image: "guardian-maps-mcp:latest" with ID "sha256:..." not yet present on node "archestra-mcp-control-plane", loading...
```

### Step 3: Configure MCP Servers in Archestra UI

1. Open Archestra at [http://localhost:3000](http://localhost:3000)
2. Navigate to **MCP Registry** or **Private MCP Registry**
3. Click **"Add MCP Server"** (or similar button)
4. Fill out the form 4 times (once for each server):

---

#### Server 1: Guardian Maps MCP

```
Display Name: Guardian Maps MCP
Docker Image: guardian-maps-mcp:latest
Command: (leave empty - uses default CMD from Dockerfile)
Arguments: (leave empty)
Transport Type: stdio
Environment Variables:
  - Key: GOOGLE_MAPS_API_KEY
    Value: [Paste your Google Maps API key here]
```

---

#### Server 2: Guardian Weather MCP

```
Display Name: Guardian Weather MCP
Docker Image: guardian-weather-mcp:latest
Command: (leave empty)
Arguments: (leave empty)
Transport Type: stdio
Environment Variables:
  - Key: OPENWEATHER_API_KEY
    Value: [Paste your OpenWeather API key here]
```

---

#### Server 3: Guardian Vision MCP (Google Cloud Vision)

```
Display Name: Guardian Vision MCP
Docker Image: guardian-vision-mcp:latest
Command: (leave empty)
Arguments: (leave empty)
Transport Type: stdio
Environment Variables:
  - Key: GOOGLE_CLOUD_VISION_API_KEY
    Value: [Paste your Google Cloud Vision API key here]

💡 Note: This MCP uses Google Cloud Vision's LABEL_DETECTION under the hood. Fast, managed, and benefits from Google's infra. Local YOLO+Moondream2 Vision is available separately via the `local-vision-mcp/` directory if you want a 100% offline option.
```

---

#### Server 4: Guardian Safety MCP

```
Display Name: Guardian Safety MCP
Docker Image: guardian-safety-mcp:latest
Command: (leave empty)
Arguments: (leave empty)
Transport Type: stdio
Environment Variables: (none - this server is purely algorithmic)
```

---

### Step 4: Create Gateway & Agent

1. **Create Gateway** (groups MCP tools together):
   - Go to **Gateways** section
   - Click **"Create Gateway"**
   - Name: `Guardian Gateway`
   - Add all 4 MCP servers to this gateway

2. **Create Agent** (LLM that uses the tools):
   - Go to **Agents** section
   - Click **"Create Agent"**
   - Name: `Guardian Escort Agent`
   - Assign the `Guardian Gateway` to this agent
   - Add system prompt (see below)

---

## 📝 Guardian Agent System Prompt

Copy this into your agent's system prompt:

```
You are Guardian, a safety escort intelligence system that helps pedestrians assess route safety.

# YOUR WORKFLOW
1. When user provides origin and destination coordinates, call get_walking_route
2. Call get_weather with the origin coordinates to get current conditions
3. If user provides a street photo (URL or base64):
   a. Call detect_objects to find physical hazards (vehicles, obstacles, construction)
   b. Call analyze_conditions to assess environmental factors (lighting, weather visibility)
4. ALWAYS call evaluate_safety with all collected data
5. Present a clear safety assessment to the user

# VISION TOOLS (Two-Part Analysis)
- **detect_objects**: Uses YOLOv8 to detect concrete objects (cars, people, barriers, obstacles)
- **analyze_conditions**: Uses Moondream2 to assess abstract conditions (lighting, wet surfaces, fog)
- Use BOTH tools when analyzing an image for complete hazard detection

# TIME OF DAY MAPPING
- 6am-11am: "morning"
- 12pm-5pm: "afternoon"
- 6pm-8pm: "evening"
- 9pm-5am: "night"

# SAFETY SCORING
The evaluate_safety tool returns a score from 0-100:
- 80-100: LOW RISK - Safe to proceed
- 60-79: MODERATE RISK - Proceed with caution
- 40-59: HIGH RISK - Consider alternative route
- 0-39: CRITICAL RISK - Strongly recommend reroute

# YOUR RULES
- Always trust the safety_score from the Safety MCP
- Explain the risk_breakdown clearly (hazards, weather, route, time penalties)
- Base your final recommendation on the Safety MCP output
- Be transparent about data sources (Maps, Weather, Vision APIs)
- Never make up safety information - only use tool results
```

---

## 🧪 Testing

### Test 1: End-to-End Route Assessment

In Archestra Chat, send:

```
I'm at 40.7128, -74.0060
Take me to 40.7580, -73.9855
Current time: 3 PM
```

**Expected Agent Behavior:**
1. ✅ Calls `get_walking_route(40.7128, -74.0060, 40.7580, -73.9855)`
2. ✅ Calls `get_weather(40.7128, -74.0060)`
3. ✅ Calls `evaluate_safety()` with all data
4. ✅ Presents safety assessment with score and recommendation

### Test 2: With Hazard Image (URL or Base64)

```
I'm walking to work. Here's what the street looks like:
https://example.com/street-photo.jpg
```

**Expected Agent Behavior:**
1. ✅ Calls `detect_objects("https://example.com/street-photo.jpg")` - YOLOv8 detection
2. ✅ Calls `analyze_conditions("https://example.com/street-photo.jpg")` - Moondream2 analysis
3. ✅ Combines hazards from both tools
4. ✅ Includes all hazards in safety evaluation

### Test 3: Verify Each MCP Tool

In Archestra, check that tools are discoverable:
- `get_walking_route` from Guardian Maps MCP
- `get_weather` from Guardian Weather MCP
- `detect_objects` from Guardian Vision MCP (YOLOv8)
- `analyze_conditions` from Guardian Vision MCP (Moondream2)
- `evaluate_safety` from Guardian Safety MCP

---

## 🔧 Troubleshooting

### Issue: Vision MCP - 403 for private image URLs

**Problem:** The image URL requires Authorization (private/signed URL) and Vision MCP gets 403.

**Solution:** Pass the image as base64 (preferred for private URLs) or provide request headers.

**Preferred (base64):**
```json
{
  "image_base64": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Alternative (URL + headers):**
```json
{
  "image_url": "https://example.com/private.png",
  "image_headers": {
    "Authorization": "Bearer <token>"
  }
}
```



## 📊 Safety Scoring Algorithm

The Safety MCP uses this transparent formula:

```javascript
Score = 100 - (HazardPenalty + WeatherPenalty + RoutePenalty + TimePenalty)

HazardPenalty:
- Critical hazard (fire, flood): -30 per hazard
- Major hazard (construction, dark): -15 per hazard
- Minor hazard (wet, debris): -5 per hazard

WeatherPenalty:
- Rain/Snow: -10
- Low visibility (<1km): -15
- High wind (>15 m/s): -10

RoutePenalty:
- Includes alley: -10
- Poorly lit: -15
- Steep stairs: -5

TimePenalty:
- Night (9pm-5am): -15
- Evening (6pm-8pm): -5
- Morning/Afternoon: 0
```

---

## 🔮 Future Scope

### Mobile Application Integration

The Guardian MCP system is designed with future mobile expansion in mind:

#### 📱 Real-Time Mobile Safety Companion

**Live Camera Hazard Detection:**
- Stream phone camera feed for continuous hazard analysis
- Real-time computer vision processing using Google Cloud Vision API
- Instant alerts for detected hazards (construction zones, wet surfaces, poor lighting, obstacles)


**Continuous Safety Monitoring:**
- Background location tracking during active navigation
- Dynamic safety score updates as you walk
- Route deviation detection with automatic re-calculation
- Emergency contact alerts on critical safety drops

**Intelligent Fallback Systems:**
- **Network Loss**: Offline hazard detection using on-device TensorFlow Lite models
- **GPS Failure**: Last-known location-based recommendations
- **API Downtime**: Cached route data and historical weather patterns
- **Low Battery**: Simplified mode with minimal power consumption

**Proactive Safety Suggestions:**
- "Cross to the well-lit side of the street"
- "Construction ahead - alternative path suggested"
- "Weather deteriorating - consider indoor route"
- "High-risk time period starting - stay vigilant"

---



## 📚 Additional Resources

- **MCP SDK Documentation**: https://github.com/modelcontextprotocol/sdk
- **Archestra Platform Docs**: https://archestra.ai/docs
- **Google Maps API**: https://developers.google.com/maps/documentation/directions
- **OpenWeather API**: https://openweathermap.org/api
- **Google Cloud Vision**: https://cloud.google.com/vision/docs

---

## 🎯 Project Status


- **Guardian MCP is implemented** ✅
- **Mobile integration is on  planning**
---



## 📄 License

MIT License - Feel free to use in your projects

---

**Built with ❤️ for pedestrian safety**
