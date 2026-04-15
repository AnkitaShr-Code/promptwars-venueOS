import { 
    VenueEvent, 
    AccessEvent, 
    SensedCrowdEvent, 
    VenueStateUpdate, 
    CongestionAlert,
    AccessType,
    HealthTier
} from '../../shared/types.js';
import { eventBus } from '../../shared/event-bus.js';
import { redis } from '../../shared/redis.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('ProcessingEngine');

const ZONE_CAPS: Record<string, number> = {
    'N': 7858, 'NE': 3169, 'E': 4697, 'SE': 3148,
    'S': 5880, 'SW': 3220, 'W': 4253, 'NW': 3149
};

const GLOBAL_MAX_CAPACITY = 35374; // Match frontend total capacity
const CONGESTION_THRESHOLD = 0.8;
const CRITICAL_THRESHOLD = 1.0;
const RECOVERY_THRESHOLD = 0.75; // Close to trigger so stale alerts self-clear within 1-2 cycles
const DECAY_LAMBDA = 0.01; // Decay rate for compliance curve

export class CrowdProcessingEngine {
    private readonly OCCUPANCY_KEY = 'venue:occupancy';
    private readonly ALERT_PREFIX = 'alert:active:';
    private readonly DIVERSION_PREFIX = 'diversion:last:';

    constructor() {
        this.initializeSubscriptions();
    }

    private initializeSubscriptions() {
        eventBus.subscribe('venue.access', (e) => this.handleAccessEvent(e as AccessEvent));
        eventBus.subscribe('sensed.crowd', (e) => this.handleSensedEvent(e as SensedCrowdEvent));
    }

    /**
     * Updates the ground-truth occupancy tally
     */
    async handleAccessEvent(event: AccessEvent) {
        // Check current occupancy before allowing entries
        if (event.accessType === AccessType.ENTRY) {
            const currentTotal = parseInt(await redis.get(this.OCCUPANCY_KEY) || '0', 10);
            if (currentTotal >= GLOBAL_MAX_CAPACITY) {
                log.warn(
                    { currentTotal, GLOBAL_MAX_CAPACITY, gateId: event.gateId },
                    'ENTRY DENIED: Venue at full capacity. No further ingress permitted.'
                );
                return; // Hard cap — no new entries beyond capacity
            }
        }

        const delta = event.accessType === AccessType.ENTRY ? event.count : -event.count;
        let newTotal = await redis.incrby(this.OCCUPANCY_KEY, delta);
        
        // Prevent negative occupancy (e.g. spurious exit pulses)
        if (newTotal < 0) {
            newTotal = 0;
            await redis.set(this.OCCUPANCY_KEY, '0');
        }

        // Also hard-cap the stored value to maximum (safety net for race conditions)
        if (newTotal > GLOBAL_MAX_CAPACITY) {
            newTotal = GLOBAL_MAX_CAPACITY;
            await redis.set(this.OCCUPANCY_KEY, String(GLOBAL_MAX_CAPACITY));
        }

        log.debug({ delta, newTotal, correlationId: event.correlationId }, 'Global occupancy updated');

        await eventBus.publish({
            type: 'update.venue',
            schemaVersion: '1.0.0',
            correlationId: event.correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            totalOccupancy: newTotal
        } as VenueStateUpdate);

        // Global capacity hysteresis alert
        const alertKey = `${this.ALERT_PREFIX}VENUE:severity`;
        const lastSeverity = await redis.get(alertKey);

        if (!lastSeverity && newTotal >= GLOBAL_MAX_CAPACITY) {
            await this.triggerAlert('VENUE', 'CRITICAL', 'Venue is at maximum capacity. Entry is suspended at all gates.', event.correlationId);
            await redis.set(alertKey, 'CRITICAL');
        } else if (lastSeverity && newTotal <= (GLOBAL_MAX_CAPACITY * 0.98)) {
            await this.clearAlert('VENUE', event.correlationId);
            await redis.del(alertKey);
        }
    }

    /**
     * Processes spatial density and manages hysteresis alerts
     */
    async handleSensedEvent(event: SensedCrowdEvent) {
        const zoneId = event.zoneId;
        const capacity = ZONE_CAPS[zoneId] || 1000;
        const rawDensity = event.count / capacity; // True mathematical scaling
        
        // 1. APPLY COMPLIANCE DECAY (V4 Mandate)
        const adjustedDensity = await this.applyComplianceDecay(zoneId, rawDensity);

        log.info({ zoneId, rawDensity, adjustedDensity, correlationId: event.correlationId }, 'Zone density processed');

        // 2. HYSTERESIS LOGIC (No-Flap Alerts)
        const alertKey = `${this.ALERT_PREFIX}${zoneId}:severity`;
        const lastSeverity = await redis.get(alertKey); // null, 'HIGH', or 'CRITICAL'

        let currentSeverity: string | null = null;
        if (adjustedDensity >= CRITICAL_THRESHOLD) {
            currentSeverity = 'CRITICAL';
        } else if (adjustedDensity >= CONGESTION_THRESHOLD) {
            currentSeverity = 'HIGH';
        }

        if (currentSeverity && currentSeverity !== lastSeverity) {
            await this.triggerAlert(zoneId, currentSeverity, currentSeverity === 'CRITICAL' ? 'Critical congestion. Gates locked.' : 'High congestion. Monitor closely.', event.correlationId);
            await redis.set(alertKey, currentSeverity);
        } else if (!currentSeverity && lastSeverity && adjustedDensity <= RECOVERY_THRESHOLD) {
            await this.clearAlert(zoneId, event.correlationId);
            await redis.del(alertKey);
        }

        // 3. BROADCAST UPDATE
        await eventBus.publish({
            type: 'update.venue',
            schemaVersion: '1.0.0',
            correlationId: event.correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            zoneId,
            density: adjustedDensity
        } as VenueStateUpdate);
    }

    private async applyComplianceDecay(zoneId: string, rawDensity: number): Promise<number> {
        const diversionTime = await redis.get(`${this.DIVERSION_PREFIX}${zoneId}`);
        if (!diversionTime) return rawDensity;

        const t = (Date.now() - parseInt(diversionTime)) / 1000;
        // Projection: Density * (1 - Reachability * Compliance * Decay)
        // Static params for demo: 60% reached, 50% complied
        const projectionFactor = 1 - (0.6 * 0.5 * Math.exp(-DECAY_LAMBDA * t));
        return rawDensity * Math.max(0.7, projectionFactor); 
    }

    private async triggerAlert(zoneId: string, severity: any, message: string, correlationId: string) {
        log.warn({ zoneId, severity }, 'ACTivating congestion alert');
        
        await eventBus.publish({
            type: 'alert.crowd',
            schemaVersion: '1.0.0',
            correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            zoneId,
            severity,
            message
        } as CongestionAlert);
    }

    private async clearAlert(zoneId: string, correlationId: string) {
        log.info({ zoneId }, 'CLEARing congestion alert');
        
        await eventBus.publish({
            type: 'alert.crowd',
            schemaVersion: '1.0.0',
            correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            zoneId,
            severity: 'LOW',
            message: 'Congestion cleared.'
        } as CongestionAlert);
    }
}

export const processingEngine = new CrowdProcessingEngine();
