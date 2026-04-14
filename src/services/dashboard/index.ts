import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { eventBus } from '../../shared/event-bus.js';
import { redis } from '../../shared/redis.js';
import { createLogger } from '../../shared/logger.js';
import { VenueEvent, HealthTier } from '../../shared/types.js';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('DashboardAPI');
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001; // Updated to natively support Cloud Run PORT env var
const distPath = path.join(process.cwd(), 'frontend/dist');

// Serve Static Frontend Assets
app.use(express.static(distPath));

// Metrics Constants
const METRIC_ALERTS = 'metric:alerts:triggered';
const METRIC_NOTIF = 'metric:notif:sent';
const OCCUPANCY_KEY = 'venue:occupancy';

export class DashboardAPI {
    private clients: Set<WebSocket> = new Set();

    constructor() {
        this.setupRoutes();
        this.setupWebSockets();
        this.setupSubscriptions();
    }

    private setupRoutes() {
        app.get('/health', async (req, res) => {
            const health = eventBus.healthCheck();
            res.json({ status: health, timestamp: Date.now() });
        });

        app.get('/occupancy', async (req, res) => {
            const count = await redis.get(OCCUPANCY_KEY);
            res.json({ totalOccupancy: parseInt(count || '0') });
        });

        app.get('/alerts', async (req, res) => {
             // Fetch active alerts from Redis keys
             const keys = await redis.keys('alert:active:*');
             res.json({ activeAlertsCount: keys.length });
        });

        app.get('/metrics', async (req, res) => {
            const [alerts, notifs, occupancy] = await Promise.all([
                redis.get(METRIC_ALERTS),
                redis.get(METRIC_NOTIF),
                redis.get(OCCUPANCY_KEY)
            ]);
            res.json({
                alertsTriggered: parseInt(alerts || '0'),
                notificationsSent: parseInt(notifs || '0'),
                totalOccupancy: parseInt(occupancy || '0')
            });
        });
    }

    private setupWebSockets() {
        wss.on('connection', async (ws) => {
            log.info('New UI client connected');
            this.clients.add(ws);
            
            // Re-sync active alerts for the new client
            try {
                const keys = await redis.keys('alert:active:*');
                for (const key of keys) {
                    if (await redis.get(key) === 'true') {
                        const zoneId = key.split(':').pop();
                        if (zoneId) {
                            const event: VenueEvent = {
                                type: 'alert.crowd',
                                schemaVersion: '1.0.0',
                                correlationId: 'sync-on-connect',
                                timestamp: Date.now(),
                                servicePath: ['DashboardAPI'],
                                zoneId,
                                severity: 'HIGH',
                                message: 'Active bottleneck detected.'
                            };
                            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
                        }
                    }
                }
            } catch (err) {
                log.error({ err }, 'Failed to sync alerts on WS connection');
            }

            ws.on('close', () => this.clients.delete(ws));
        });
    }

    private setupSubscriptions() {
        // Broadcast all relevant updates to connected UI clients
        const topics = ['update.venue', 'alert.crowd', 'update.queue', 'metrics.dashboard'];
        
        topics.forEach(topic => {
            eventBus.subscribe(topic, async (event: VenueEvent) => {
                // Tracking metrics in Redis
                if (topic === 'alert.crowd') await redis.incr(METRIC_ALERTS);

                const message = JSON.stringify(event);
                this.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            });
        });
    }

    public start() {
        server.listen(PORT as number, '0.0.0.0', () => {
            log.info({ distPath }, `Dashboard API & WS Server running on port ${PORT}`);
        });
    }
}

const dashboardApi = new DashboardAPI();
dashboardApi.start();
