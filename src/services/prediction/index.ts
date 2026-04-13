import { 
    QueuePulseEvent, 
    QueueStateUpdate,
    SchemaVersion
} from '../../shared/types.js';
import { eventBus } from '../../shared/event-bus.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('PredictionService');
const VERSION: SchemaVersion = '1.0.0';

interface StallStats {
    arrivals: number[];
    departures: number[];
    currentLength: number;
}

export class QueuePredictionService {
    private stallData: Map<string, StallStats> = new Map();
    private readonly WINDOW_SIZE_MS = 60000; // 1 minute window for rates

    constructor() {
        eventBus.subscribe('queue.pulse', (e) => this.handlePulse(e as QueuePulseEvent));
    }

    private async handlePulse(event: QueuePulseEvent) {
        const { stallId, pulseType } = event;
        const now = Date.now();
        
        let stats = this.stallData.get(stallId) || { arrivals: [], departures: [], currentLength: 0 };
        
        if (pulseType === 'ARRIVAL') {
            stats.arrivals.push(now);
            stats.currentLength++;
        } else {
            stats.departures.push(now);
            stats.currentLength = Math.max(0, stats.currentLength - 1);
        }

        // Cleanup old data from window
        stats.arrivals = stats.arrivals.filter(t => now - t < this.WINDOW_SIZE_MS);
        stats.departures = stats.departures.filter(t => now - t < this.WINDOW_SIZE_MS);
        
        this.stallData.set(stallId, stats);

        await this.predict(stallId, event.correlationId);
    }

    private async predict(stallId: string, correlationId: string) {
        const stats = this.stallData.get(stallId);
        if (!stats) return;

        // Rates per second
        const lambda = stats.arrivals.length / (this.WINDOW_SIZE_MS / 1000);
        const mu = stats.departures.length / (this.WINDOW_SIZE_MS / 1000);

        let waitTimeSec = 0;

        // M/M/1 Model: W = 1 / (mu - lambda)
        // Only stable if mu > lambda
        if (mu > lambda) {
            waitTimeSec = 1 / (mu - lambda);
        } else {
            // Heuristic Fallback: length * average service time
            const avgServiceTime = mu > 0 ? (1 / mu) : 30; // 30s default
            waitTimeSec = stats.currentLength * avgServiceTime;
        }

        log.debug({ stallId, waitTimeSec, lambda, mu }, 'Queue prediction updated');

        await eventBus.publish({
            type: 'update.queue',
            schemaVersion: VERSION,
            correlationId,
            timestamp: Date.now(),
            servicePath: ['PredictionService'],
            stallId,
            waitTimeSec: Math.round(waitTimeSec),
            queueLength: stats.currentLength,
            lambda,
            mu
        } as QueueStateUpdate);
    }
}

export const queuePredictionService = new QueuePredictionService();
