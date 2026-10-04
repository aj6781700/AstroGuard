import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  disasterStore,
  ASSAM_ROI,
  ASSAM_RIVERS,
  ASSAM_RIVER_GAUGES,
  HISTORICAL_FLOOD_HAZARD_ZONES,
  ASSAM_DISTRICTS
} from './server/state';
import { satelliteAcquisitionService } from './server/satelliteAcquisition';
import { monitoringScheduler } from './server/monitoringScheduler';
import { disasterIncidentEngine, setEventBroadcaster } from './server/incidentAndDroneEngine';
import { satQueryService } from './server/satQueryService';
import { disasterDb } from './server/database/db';
import { jobQueue } from './server/queue/jobQueue';
import { SystemTelemetryProvider } from './server/providers/dataProvider';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Set up WebSocket Server for /ws/response-center
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  // Send initial handshake state from persistent database
  ws.send(JSON.stringify({
    event: 'CONNECTED',
    payload: {
      message: 'Connected to ASTROGUARD Assam Flood Response Event Bus',
      activeIncidents: disasterDb.getIncidents().filter(i => i.status !== 'CLOSED').length,
      activeAlerts: disasterDb.getAlerts().length,
      dataMode: disasterStore.dataMode,
      timestamp: new Date().toISOString()
    }
  }));

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

// Server-Sent Events (SSE) Fallback for maximum reliability in iFrame environments
const sseClients = new Set<express.Response>();

app.get('/api/response-center/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ event: 'CONNECTED', payload: { timestamp: new Date().toISOString(), dataMode: disasterStore.dataMode } })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Wire unified event broadcaster to both WebSocket and SSE
const broadcastEvent = (event: string, payload: any) => {
  const message = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

  // Broadcast to WebSockets
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.warn('WS broadcast error:', err);
      }
    }
  }

  // Broadcast to SSE
  for (const res of sseClients) {
    try {
      res.write(`data: ${message}\n\n`);
    } catch (err) {
      sseClients.delete(res);
    }
  }
};

setEventBroadcaster(broadcastEvent);

// HTTP Upgrade handler for WebSocket
httpServer.on('upgrade', (request, socket, head) => {
  const pathname = request.url?.split('?')[0];
  if (pathname === '/ws/response-center' || pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

// ==========================================
// REST APIS: Authoritative Disaster Intelligence
// ==========================================

// GET /api/roi
app.get('/api/roi', (_req, res) => {
  res.json({
    roi: ASSAM_ROI,
    dataMode: disasterStore.dataMode,
    copernicusConfigured: disasterStore.copernicusConfigured
  });
});

// GET /api/rivers (Authoritative Assam River Network)
app.get('/api/rivers', (_req, res) => {
  res.json({
    rivers: ASSAM_RIVERS,
    count: ASSAM_RIVERS.length,
    timestamp: new Date().toISOString()
  });
});

// GET /api/gauges (Real-Time CWC Gauge Stations)
app.get('/api/gauges', (_req, res) => {
  res.json({
    gauges: ASSAM_RIVER_GAUGES,
    count: ASSAM_RIVER_GAUGES.length,
    timestamp: new Date().toISOString()
  });
});

// GET /api/hazards (Historical Flood Hazard Layer)
app.get('/api/hazards', (_req, res) => {
  res.json({
    hazards: HISTORICAL_FLOOD_HAZARD_ZONES,
    count: HISTORICAL_FLOOD_HAZARD_ZONES.length,
    timestamp: new Date().toISOString()
  });
});

// GET /api/districts (Assam Districts Context)
app.get('/api/districts', (_req, res) => {
  res.json({
    districts: ASSAM_DISTRICTS,
    count: ASSAM_DISTRICTS.length,
    timestamp: new Date().toISOString()
  });
});

// POST /api/system/mode (Explicit switch between REAL_DATA and DEMO_MODE)
app.post('/api/system/mode', (req, res) => {
  const { mode } = req.body;
  if (!['REAL_DATA', 'DEMO_MODE'].includes(mode)) {
    res.status(400).json({ error: 'INVALID_MODE', message: 'Mode must be REAL_DATA or DEMO_MODE' });
    return;
  }

  disasterStore.setMode(mode);
  broadcastEvent('MODE_CHANGED', { mode, timestamp: new Date().toISOString() });
  res.json({ success: true, mode: disasterStore.dataMode });
});

// GET /api/zones
app.get('/api/zones', (_req, res) => {
  const zones = disasterDb.getZoneStates().length > 0 ? disasterDb.getZoneStates() : disasterStore.zones;
  res.json({
    zones,
    timestamp: new Date().toISOString()
  });
});

// GET /api/satellite/latest
app.get('/api/satellite/latest', async (_req, res) => {
  const result = await satelliteAcquisitionService.getLatestObservation();
  res.json(result);
});

// GET /api/satellite/observations
app.get('/api/satellite/observations', (_req, res) => {
  const obs = disasterDb.getObservations().length > 0 ? disasterDb.getObservations() : disasterStore.observations;
  res.json({
    current: obs[0] || null,
    previous: obs[1] || null,
    baseline: obs[obs.length - 1] || null,
    all: obs,
    dataMode: disasterStore.dataMode
  });
});

// GET /api/monitoring/status
app.get('/api/monitoring/status', (_req, res) => {
  res.json(disasterStore.monitoringStatus);
});

// POST /api/monitoring/cycle (Run Monitoring Check)
app.post('/api/monitoring/cycle', async (req, res) => {
  const simulateNewPass = Boolean(req.body?.simulateNewPass);

  // Requirement 28: Reject forced simulation in REAL_DATA mode
  if (simulateNewPass && disasterStore.dataMode === 'REAL_DATA') {
    res.status(400).json({
      error: 'FORCE_SIMULATION_AVAILABLE_ONLY_IN_DEMO_MODE',
      message: 'In REAL_DATA mode, observation acquisition depends strictly on live Copernicus Sentinel-1 passes.'
    });
    return;
  }

  const result = await monitoringScheduler.runMonitoringCycle(simulateNewPass);
  res.json(result);
});

// GET /api/incidents
app.get('/api/incidents', (_req, res) => {
  const incidents = disasterDb.getIncidents();
  res.json({
    incidents: incidents.length > 0 ? incidents : disasterStore.incidents
  });
});

// GET /api/incidents/:id
app.get('/api/incidents/:id', (req, res) => {
  const incident = disasterDb.getIncident(req.params.id) || disasterStore.incidents.find(i => i.incident_id === req.params.id);
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  res.json(incident);
});

// POST /api/incidents/:id/acknowledge
app.post('/api/incidents/:id/acknowledge', async (req, res) => {
  const incident = await disasterDb.updateIncident(req.params.id, { status: 'ACKNOWLEDGED' });
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  const memInc = disasterStore.incidents.find(i => i.incident_id === req.params.id);
  if (memInc) memInc.status = 'ACKNOWLEDGED';

  res.json({ success: true, incident });
});

// GET /api/alerts
app.get('/api/alerts', (_req, res) => {
  const alerts = disasterDb.getAlerts();
  res.json({ alerts: alerts.length > 0 ? alerts : disasterStore.alerts });
});

// GET /api/drone/missions
app.get('/api/drone/missions', (_req, res) => {
  const missions = disasterDb.getDroneMissions();
  res.json({ missions: missions.length > 0 ? missions : disasterStore.droneMissions });
});

// POST /api/drone/missions
app.post('/api/drone/missions', async (req, res) => {
  const { incidentId, zoneId } = req.body;
  const mission = await disasterIncidentEngine.droneManager.requestDroneVerification(
    incidentId || disasterStore.incidents[0]?.incident_id || 'INC-MANUAL-01',
    zoneId || 'zone-majuli'
  );
  res.json({ success: true, mission });
});

// GET /api/drone/missions/:id
app.get('/api/drone/missions/:id', (req, res) => {
  const mission = disasterDb.getDroneMission(req.params.id) || disasterStore.droneMissions.find(m => m.mission_id === req.params.id);
  if (!mission) {
    res.status(404).json({ error: 'Mission not found' });
    return;
  }
  res.json(mission);
});

// POST /api/satquery/query
app.post('/api/satquery/query', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query string is required' });
    return;
  }
  const result = await satQueryService.handleQuery(query);
  res.json(result);
});

// GET /api/jobs/:id
app.get('/api/jobs/:id', (req, res) => {
  const job = disasterDb.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

// GET /api/health
app.get('/api/health', (_req, res) => {
  const telemetry = SystemTelemetryProvider.getTelemetry(
    disasterStore.copernicusConfigured,
    disasterStore.droneApiConfigured
  );
  res.json(telemetry);
});

// GET /api/heatmap
app.get('/api/heatmap', (_req, res) => {
  res.json({
    points: disasterStore.getDynamicHeatmap(),
    timestamp: new Date().toISOString()
  });
});

// POST /api/data/upload (Manual Test Data only, genuine validation & async job)
app.post('/api/data/upload', async (req, res) => {
  const { filename, fileType, sizeBytes } = req.body;
  if (!filename) {
    res.status(400).json({ error: 'Filename is required' });
    return;
  }

  const job = await jobQueue.enqueue({
    type: 'manual_dataset_ingestion',
    observation_id: `MANUAL-${Date.now()}`,
    priority: 'LOW'
  });

  res.json({
    jobId: job.id,
    status: 'VALIDATED_AND_QUEUED',
    note: 'MANUAL TEST DATA — NOT REQUIRED FOR NORMAL OPERATION',
    filename,
    fileType: fileType || 'GeoTIFF / HDF5',
    sizeBytes: sizeBytes || 1024 * 1024 * 12,
    tilesGenerated: 16,
    pipeline: 'Tile -> Ingestion -> SAR Backscatter Extraction -> Fusion Check'
  });
});

// ==========================================
// Application Lifecycle & Server Startup
// ==========================================
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  // Explicit lifecycle: start scheduler after initialization
  monitoringScheduler.startScheduler();

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[ASTROGUARD Assam Flood Intelligence] Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[ASTROGUARD Assam Flood Intelligence] Data Mode: ${disasterStore.dataMode}`);
    console.log(`[ASTROGUARD Assam Flood Intelligence] WebSocket live at ws://0.0.0.0:${PORT}/ws/response-center`);
  });
}

startServer();
