import { ingestionService } from './services/ingestion/index.js';
import { AccessType, ZoneType } from './shared/types.js';
import { createLogger } from './shared/logger.js';
const log = createLogger('Simulation');
export class VenueSimulation {
    interval = null;
    isHalftime = false;
    start() {
        log.info('Starting VenueOS Simulation (50k attendee load)...');
        // 1. Regular Traffic Loop (Every 2s)
        this.interval = setInterval(() => {
            this.generateTraffic();
        }, 2000);
        // 2. Interpolation Watchdog (Every 5s)
        setInterval(() => {
            ingestionService.checkAndInterpolate();
        }, 5000);
        // 3. Error Injection (Every 30s)
        setInterval(() => {
            this.injectErrors();
        }, 30000);
    }
    triggerHalftime(active) {
        this.isHalftime = active;
        log.warn({ isHalftime: active }, 'SIMULATION_STATE_CHANGE: Halftime mode');
    }
    async generateTraffic() {
        // Gates (Entries/Exits)
        const entries = this.isHalftime ? 5 : 50; // Fewer entries during halftime
        const exits = this.isHalftime ? 200 : 10; // Massive exits during halftime
        for (let i = 0; i < entries; i++) {
            await ingestionService.ingestAccessPulse(`GATE_${Math.floor(Math.random() * 10)}`, AccessType.ENTRY);
        }
        for (let i = 0; i < exits; i++) {
            await ingestionService.ingestAccessPulse(`GATE_${Math.floor(Math.random() * 10)}`, AccessType.EXIT);
        }
        // Zone Sensed Data
        const zones = ['ZONE_A', 'ZONE_B', 'ZONE_C', 'ZONE_D'];
        for (const zoneId of zones) {
            // High density spike in Zone B during halftime (concessions)
            const spike = (this.isHalftime && zoneId === 'ZONE_B') ? 400 : 0;
            const base = 200 + Math.floor(Math.random() * 100);
            await ingestionService.ingestSensedCrowd(zoneId, ZoneType.CONCOURSE, base + spike, 0.9 // High confidence
            );
        }
    }
    async injectErrors() {
        log.info('Injecting malformed event for DLQ verification...');
        // @ts-ignore - explicitly passing bad data
        await ingestionService.ingestSensedCrowd('INVALID_ZONE', ZoneType.GATE, -100, 5.0);
    }
}
export const simulation = new VenueSimulation();
//# sourceMappingURL=simulation.js.map