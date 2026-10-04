# ASTROGUARD — SatQuery AI
### AI-Powered Disaster Intelligence & Response Agent

ASTROGUARD is a disaster-intelligence platform designed for **flood monitoring, risk assessment, evidence-based incident detection, and response coordination**.

The system combines satellite observations, SAR-based flood analysis, temporal change detection, terrain susceptibility, rainfall risk, semantic flood segmentation, and multi-modal risk fusion into a single operational pipeline.

It also provides **SatQuery AI**, a natural-language interface that allows an operator to ask questions about the current disaster state and receive evidence-backed answers.

---

## 1. Problem

During a flood, disaster-response teams need answers to questions such as:

- Where is flooding increasing?
- What changed compared with the previous satellite observation?
- Which area is at the highest risk?
- Why has a zone become critical?
- How much water/inundation has been detected?
- What terrain and rainfall conditions are contributing to the risk?
- Which incident needs verification?
- Should a drone verification mission be dispatched?
- When should the next monitoring cycle run?

Traditional systems often expose raw satellite/GIS information separately. ASTROGUARD converts these signals into a **continuous intelligence → risk → incident → response workflow**.

---

# 2. Core Idea

```text
Satellite / Environmental Data
            │
            ▼
   Observation Acquisition
            │
            ▼
     Lightweight Change Gate
            │
      Meaningful Change?
       ┌────┴────┐
       │         │
      NO        YES
       │         │
   Standby       ▼
          6-Stage AI Pipeline
                │
                ▼
        Multi-Modal Risk Fusion
                │
        ┌───────┴────────┐
        │                │
      Normal         Critical
        │                │
   Risk Update     Incident Created
                         │
                         ▼
                 Drone Verification
                         │
                         ▼
                  Response Center
```

---

# 3. Six-Stage Intelligence Pipeline

## Model 1 — Sentinel-1 SAR Flood Detection

**Purpose:** Detect surface-water/inundation from radar backscatter.

### Input
- Sentinel-1 GRD observation
- VV/VH polarization
- GeoTIFF raster

### Processing
- SAR raster acquisition
- Backscatter extraction
- Speckle reduction using a Lee filter
- Water-pixel classification
- Spatial/zone-level inundation estimation

The implementation uses a configurable backscatter threshold and produces water-area, water-pixel, tile and spatial-risk information.

### Output

```text
Water Pixels
      ↓
Flood / Water Mask
      ↓
Inundated Area
      ↓
Zone-wise Flood Statistics
```

SAR is useful during disasters because radar observations can operate independently of daylight and are much less affected by cloud cover than optical imagery.

---

# 4. Model 2 — Bi-Temporal Change Detection

A single satellite image tells us the current state.

ASTROGUARD also asks:

> **What changed from T-1 to T?**

The system compares the latest observation with the immediately previous observation.

### Signals

- Water-area delta
- Relative expansion percentage
- Change score
- VV/VH change information
- New / persistent / receded flood areas

### Why it matters

```text
T-1 → 138.4 km²
T   → 161.5 km²

Change → +23.1 km²
```

This prevents the system from treating every observation as a new emergency.

---

# 5. Lightweight Change Gate

Before executing the complete pipeline, ASTROGUARD performs a fast change check.

```text
New Observation
      ↓
Compare T vs T-1
      ↓
Meaningful Change?
   /          \
 NO            YES
 |              |
Stop       Run full pipeline
```

This is important because expensive processing should not run when the new observation shows insignificant variation.

The gate uses both:

- relative water-area change
- coarse change score

A significant change moves the observation into the full AI pipeline.

---

# 6. Model 3 — Terrain Flood Susceptibility

Flood detection and flood susceptibility are different problems.

### Flood Detection

> Is water present now?

### Terrain Susceptibility

> Is this location naturally vulnerable to flooding?

ASTROGUARD uses elevation and slope information to classify terrain susceptibility.

```text
DEM / Elevation
       +
Slope
       ↓
Terrain Susceptibility
       ↓
LOW / MEDIUM / HIGH / EXTREME
```

Low-lying, low-slope floodplain areas receive higher susceptibility.

---

# 7. Model 4 — Rainfall / Runoff Risk

Rainfall contributes to future flood risk.

The system considers:

- observed/recorded 24-hour rainfall
- next 24-hour forecast rainfall

The current implementation derives a normalized runoff-risk factor from these values.

```text
Past 24h Rainfall
        +
Forecast Rainfall
        ↓
Runoff Risk
        ↓
0.0 ─────────────── 1.0
Low                 High
```

For live mode, the project integrates rainfall data through **Open-Meteo**.

---

# 8. Model 5 — Multi-Channel Flood Segmentation

The pipeline includes a semantic segmentation stage intended to separate different flood-related spatial classes.

The current pipeline represents four thematic classes:

```text
1. Deep Standing Water
2. Urban Street Inundation
3. Saturated Topsoil
4. Dry High Ground
```

The architecture records segmentation evidence such as:

- thematic channels
- IoU metric
- spatial resolution
- class-level output

This allows the system to move beyond a simple binary flooded/not-flooded interpretation.

---

# 9. Model 6 — Multi-Modal Risk Fusion

No single signal is sufficient for reliable disaster assessment.

ASTROGUARD combines multiple evidence sources.

### Current fusion weights

| Evidence | Weight |
|---|---:|
| SAR flood probability | 30% |
| Temporal change | 25% |
| Terrain susceptibility | 25% |
| Rainfall risk | 20% |

Conceptually:

```text
Risk Score =
0.30 × SAR
+ 0.25 × Temporal Change
+ 0.25 × Terrain
+ 0.20 × Rainfall
```

### Risk Levels

```text
0.00 ─ 0.34  → LOW
0.35 ─ 0.59  → MEDIUM
0.60 ─ 0.81  → HIGH
0.82 ─ 1.00  → CRITICAL
```

This is more robust than triggering an alert from one data source alone.

---

# 10. Autonomous Incident Creation

When the fused risk crosses the critical threshold, the system can automatically create an incident.

```text
SAR Evidence
     +
Temporal Evidence
     +
Terrain Evidence
     +
Rainfall Evidence
     ↓
Risk Fusion
     ↓
CRITICAL
     ↓
Incident Created
     ↓
Drone Verification Requested
```

The incident contains supporting evidence such as:

- previous water area
- current water area
- area delta
- percentage expansion
- SAR probability
- temporal change score
- terrain susceptibility
- rainfall risk

---

# 11. Drone Verification Engine

After a critical incident is detected, the response layer can create a drone verification mission.

The system tracks:

- incident ID
- target zone
- mission status
- verification evidence
- mission metadata

The project supports a demo/control mode so the complete response workflow can be demonstrated without requiring a physical drone fleet.

---

# 12. SatQuery AI

ASTROGUARD includes a natural-language disaster query interface.

Instead of manually checking multiple dashboards, an operator can ask:

```text
What changed since the previous observation?
```

```text
Why is this zone critical?
```

```text
What is the current flood extent?
```

```text
What is the terrain risk?
```

```text
What is the rainfall risk?
```

```text
What should happen next?
```

The query layer classifies the user's intent and retrieves current system state from the persistent disaster data.

### Supported query categories include

- What changed?
- Why is the zone critical?
- Flood extent
- Terrain risk
- Rainfall risk
- Road accessibility
- Drone status
- Active incident
- Response-center status
- Next monitoring time
- Satellite status
- Evidence comparison
- Recommended next action

---

# 13. Real-Time Monitoring

ASTROGUARD does not depend only on manual refresh.

The frontend communicates with the backend using:

- REST APIs
- WebSocket
- Server-Sent Events fallback

### Real-time flow

```text
Backend Event
      │
      ├── WebSocket
      │
      └── SSE Fallback
              │
              ▼
       Response Center UI
```

If WebSocket connectivity fails, the application can fall back to Server-Sent Events.

---

# 14. Adaptive Monitoring

The monitoring scheduler continuously checks for new observations.

A typical cycle is:

```text
Check Satellite Source
        ↓
Find Latest Observation
        ↓
Is it New?
   ┌────┴────┐
   NO        YES
   │          │
Standby       ▼
        Persist Observation
               ↓
        Lightweight Gate
               ↓
        Full AI Pipeline
               ↓
          Risk Updated
               ↓
      Critical Incident?
          /          \
        NO            YES
        │              │
      Finish      Drone Verification
```

The system also uses a distributed lock based on observation ID to avoid duplicate processing across workers.

---

# 15. REAL DATA and DEMO MODE

The application supports two operating modes.

## REAL_DATA

Used when live external credentials/services are configured.

The project can use:

- Copernicus Data Space
- Sentinel-1 GRD
- Sentinel Hub / CDSE Process API
- Open-Meteo
- live elevation source

In REAL_DATA mode, forced synthetic satellite passes are rejected.

## DEMO_MODE

Used for hackathon demonstrations and development.

It provides deterministic/simulated observations so that the complete workflow can be demonstrated without waiting for a new satellite pass.

```text
DEMO_MODE
   ↓
Synthetic Observation
   ↓
AI Pipeline
   ↓
Risk Fusion
   ↓
Incident
   ↓
Drone Verification
```

---

# 16. Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Leaflet
- Lucide React
- Motion

## Backend / Runtime

- Node.js
- TypeScript
- Express
- WebSocket (`ws`)
- Server-Sent Events
- GeoTIFF processing

## Data & Persistence

- PostgreSQL
- `pg`
- Local/persistent disaster state
- Redis-compatible queue configuration

## AI / Analytics

- Sentinel-1 SAR processing
- Lee speckle filtering
- Bi-temporal change detection
- DEM/elevation analysis
- Rainfall/runoff risk
- Semantic segmentation pipeline
- Bayesian-style weighted risk fusion
- SatQuery intent routing

## Python Intelligence Layer

The repository also contains modular Python components for:

- disaster-agent orchestration
- SatQuery intent routing
- SAR inference
- terrain inference
- rainfall inference
- risk fusion
- preprocessing
- Celery task definitions

---

# 17. External Data Sources

| Source | Purpose |
|---|---|
| Copernicus Data Space | Sentinel-1 satellite observations |
| Sentinel Hub / CDSE Process API | SAR raster acquisition |
| Open-Meteo | Rainfall / precipitation data |
| Open-Elevation | Elevation lookup |
| DEM data | Terrain susceptibility |
| PostgreSQL | Persistent application state |
| Redis | Queue / distributed processing configuration |

---

# 18. Project Architecture

```text
ASTROGUARD
│
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── MapViewer
│   │   ├── ResponseCenterPanel
│   │   ├── DroneResponsePanel
│   │   ├── MonitoringSchedulerPanel
│   │   ├── TemporalTimelinePanel
│   │   ├── MultiModelEvidencePanel
│   │   ├── AgentTracePanel
│   │   ├── WorkerHealthPanel
│   │   ├── SatQueryStudioView
│   │   └── ZonesDetailPanel
│   └── types/
│
├── server/
│   ├── aiPipeline.ts
│   ├── sentinel1Processor.ts
│   ├── satQueryService.ts
│   ├── satelliteAcquisition.ts
│   ├── monitoringScheduler.ts
│   ├── incidentAndDroneEngine.ts
│   ├── state.ts
│   ├── providers/
│   ├── database/
│   └── queue/
│
├── backend/
│   ├── agents/
│   ├── inference/
│   ├── preprocessing/
│   ├── app/
│   └── tasks/
│
├── server.ts
├── package.json
├── vite.config.ts
└── .env.example
```

---

# 19. Installation

## Prerequisites

Install:

- Node.js 18+
- npm or Bun
- PostgreSQL
- Redis (required for production-style queue configuration)
- Python 3.10+ if using the Python intelligence modules

---

## Install Node Dependencies

```bash
npm install
```

or, if using Bun:

```bash
bun install
```

---

# 20. Environment Configuration

Create a `.env` file from `.env.example`.

```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

APP_URL="http://localhost:3000"

COPERNICUS_CLIENT_ID=""
COPERNICUS_CLIENT_SECRET=""

COPERNICUS_TOKEN_URL="https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

COPERNICUS_STAC_URL="https://stac.dataspace.copernicus.eu/v1/"

SENTINEL_PROCESS_API_URL="https://sh.dataspace.copernicus.eu/api/v1/process"

DATABASE_URL="postgresql://disaster_user:password@localhost:5432/disaster_intelligence"

REDIS_URL="redis://localhost:6379/0"

DEMO_MODE=true

DRONE_MODE="demo"

DRONE_API_URL=""

RAINFALL_PROVIDER="open-meteo"

RAINFALL_API_KEY=""
```

### Important

For a hackathon demo, keep:

```env
DEMO_MODE=true
```

For live Sentinel-1 processing, configure valid Copernicus credentials and set:

```env
DEMO_MODE=false
```

---

# 21. Run the Application

Development mode:

```bash
npm run dev
```

The application starts on:

```text
http://localhost:3000
```

The development server runs the Vite frontend together with the Express backend.

---

# 22. Production Build

Build:

```bash
npm run build
```

Start:

```bash
npm start
```

Type checking:

```bash
npm run lint
```

---

# 23. Important API Endpoints

## Disaster State

```http
GET /api/roi
GET /api/zones
GET /api/rivers
GET /api/gauges
GET /api/hazards
GET /api/districts
```

## Satellite

```http
GET /api/satellite/latest
GET /api/satellite/observations
```

## Monitoring

```http
GET  /api/monitoring/status
POST /api/monitoring/cycle
```

## Incidents

```http
GET  /api/incidents
GET  /api/incidents/:id
POST /api/incidents/:id/acknowledge
```

## Drone

```http
GET  /api/drone/missions
POST /api/drone/missions
GET  /api/drone/missions/:id
```

## SatQuery

```http
POST /api/satquery/query
```

Example:

```json
{
  "query": "Why is the current critical zone at high risk?"
}
```

## System

```http
GET /api/health
GET /api/heatmap
POST /api/system/mode
```

## Real-Time Events

WebSocket:

```text
/ws/response-center
```

SSE fallback:

```text
/api/response-center/events
```

---

# 24. Key Design Decisions

### Why SAR?

Optical satellite imagery can be affected by clouds and daylight. SAR provides radar-based observations that are highly useful for flood/water detection.

### Why T vs T-1?

Disaster response is about **change**, not only the current snapshot.

### Why multiple models?

Flood severity depends on multiple factors:

```text
Current Water
+ Change
+ Terrain
+ Rainfall
```

Combining them reduces dependence on a single signal.

### Why a change gate?

Running the complete pipeline for every insignificant observation wastes compute. The lightweight gate filters out low-value observations first.

### Why evidence-backed queries?

A disaster-response system should not simply generate an answer. It should be able to show **why** the answer was produced and which observations support it.

### Why WebSocket + SSE?

Real-time incident updates are important, but WebSocket connectivity may not always be reliable in constrained environments. SSE provides a fallback channel.

---

# 25. Safety / Data Integrity Rules

ASTROGUARD explicitly separates real and simulated data.

The system tracks:

```text
REAL_DATA
DEMO_MODE
```

Real satellite observations are marked as authoritative when acquired from the configured Copernicus source.

Synthetic observations are explicitly marked as demo data.

In REAL_DATA mode, the system does not allow a forced synthetic satellite pass to be treated as a real observation.

---

# 26. Response Workflow

The complete operational workflow is:

```text
1. Acquire Observation
          ↓
2. Validate / Persist
          ↓
3. Compare T vs T-1
          ↓
4. Lightweight Change Gate
          ↓
5. SAR Flood Detection
          ↓
6. Temporal Change Detection
          ↓
7. Terrain Susceptibility
          ↓
8. Rainfall Risk
          ↓
9. Flood Segmentation
          ↓
10. Multi-Modal Risk Fusion
          ↓
11. Zone Risk Update
          ↓
12. Critical Incident Detection
          ↓
13. Drone Verification
          ↓
14. Response Center Alert
          ↓
15. SatQuery Evidence-Based Explanation
```

---

# 27. Why ASTROGUARD is Different

ASTROGUARD is designed as a **closed-loop disaster intelligence system**, not only a visualization dashboard.

### It connects:

```text
OBSERVE
   ↓
UNDERSTAND
   ↓
PREDICT / ASSESS
   ↓
DECIDE
   ↓
VERIFY
   ↓
RESPOND
```

The key differentiator is the connection between:

**satellite evidence → temporal change → multi-modal risk → autonomous incident → field verification → operator intelligence.**

---

# 28. Future Extensions

Potential production extensions include:

- Real trained deep-learning segmentation model
- Real drone/UAV telemetry integration
- OpenStreetMap + routing-based evacuation analysis
- IVR and low-bandwidth emergency messaging
- More disaster types beyond floods
- Automated evacuation-zone recommendation
- River-gauge time-series integration
- Model calibration using historical flood datasets
- Cloud deployment with distributed workers
- Kubernetes-based horizontal scaling
- More advanced probabilistic risk calibration

---

# 29. Team

**Team:** Idealverse

**Model:** ASTROGUARD

**Platform:** SatQuery AI — Disaster Intelligence & Response Agent

---

## License

This project is a hackathon/research prototype. External datasets and APIs remain subject to their respective providers' terms and licenses.
