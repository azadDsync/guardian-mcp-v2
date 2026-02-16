## 🔍 Local Vision MCP: Hybrid Architecture (YOLO + Moondream2)

The **local Vision MCP** in `local-vision-mcp/` provides **two complementary tools** for comprehensive hazard detection without calling external APIs:

### Tool 1: `detect_objects` (YOLO)
**Technology:** YOLOv8 Nano - Ultralytics  
**Speed:** ~200-500ms per image  
**Detects Physical Objects:**

| Category | Objects Detected | Hazard Type | Severity |
|----------|------------------|-------------|----------|
| 🚗 Vehicles | cars, trucks, buses, motorcycles | `traffic_risk` | 0.5-0.7 |
| 🚧 Construction | cones, barriers, excavators | `construction` | 0.7 |
| 🚶 People | person (5+ = crowding) | `crowding` | 0.4-0.8 |
| 🐕 Animals | dogs, cats | `animal_hazard` | 0.3-0.5 |
| 🛑 Signs | stop signs, traffic controls | `traffic_control` | 0.2 |

**Output Example:**
```json
{
  "objects": [
    {"class": "car", "confidence": 0.89, "count": 3},
    {"class": "person", "confidence": 0.85, "count": 12}
  ],
  "hazards": [
    {"type": "traffic_risk", "severity": 0.6, "evidence": "3 car(s) detected"},
    {"type": "crowding", "severity": 0.55, "evidence": "12 person(s) detected"}
  ]
}
```

### Tool 2: `analyze_conditions` (Moondream2 Vision)
**Technology:** Moondream2 1.6B - Lightweight vision-language model  
**Speed:** ~300-800ms per image (much faster than LLMs!)  
**Detects Environmental Conditions:**

| Category | Values | Hazard Type | Severity |
|----------|--------|-------------|----------|
| 💡 Lighting | well_lit, poorly_lit, dark | `poorly_lit` | 0.6-0.7 |
| 🌧️ Weather | clear, wet_surface, rain, fog, snow | `wet_floor`, `low_visibility` | 0.5-0.7 |
| 👁️ Visibility | good, moderate, poor | `low_visibility` | 0.65 |
| 🏚️ Area Quality | well/avg/poorly_maintained | `area_neglect` | 0.45 |
| 🏙️ Area Type | busy/quiet/isolated/residential | `isolation` | 0.55 |

**Output Example:**
```json
{
  "conditions": {
    "lighting": "poorly_lit",
    "weather_visible": "wet_surface",
    "visibility": "moderate",
    "area_quality": "poorly_maintained",
    "area_type": "quiet_street"
  },
  "hazards": [
    {"type": "poorly_lit", "severity": 0.6, "description": "Dark street with minimal lighting"},
    {"type": "wet_floor", "severity": 0.5, "description": "Wet pavement from recent rain"}
  ]
}
```

## 🔌 Local Vision MCP in Archestra

The **local Vision MCP** (`local-vision-mcp/`, YOLOv8 + Moondream2) is compatible with Archestra’s MCP Orchestrator (stdio in Kubernetes). To avoid delay and timeout errors in the Chat UI:

- **Tool work runs in a thread pool** so the MCP connection stays alive and the event loop can handle keepalives and other messages.
- **Unbuffered I/O** (`PYTHONUNBUFFERED=1` and line-buffered stderr) so logs and readiness are visible to the orchestrator immediately.
- **Configurable tool timeout**: set `VISION_TOOL_TIMEOUT_SEC=300` (default) or higher in the *local* Vision MCP server’s environment so the first Moondream2 load (2–3 min) does not hit a lower platform timeout.

If the Chat UI still times out, ensure the **orchestrator/platform** timeout for this MCP server is at least 5 minutes for the first local Vision tool call, or run a warmup (e.g. one `analyze_conditions` call) after deployment so later user queries are fast.

---

### Why Two Tools?

**YOLO** excels at detecting **concrete, physical objects** but cannot assess abstract conditions.  
**Moondream2** understands **context and environment** but may miss small objects.  
**Together** they provide comprehensive hazard detection combining speed (YOLO) and semantic understanding (Moondream2).

**Cost:** $0 - Both run locally, no API fees!