import { ingestionService } from './services/ingestion/index.js';
import { AccessType, ZoneType } from './shared/types.js';
import { createLogger } from './shared/logger.js';
import { dlq } from './shared/dlq.js';

const log = createLogger('Simulation');

/**
 * ----------------------------------------------------
 * CONFIGURABLE DEMO DATA
 * Tweak these variables to see how the system reacts.
 * ----------------------------------------------------
 */
export const DemoConfig = {
    // Traffic rates (calls per interval)
    baseEntries: 20,
    baseExits: 5,
    
    // Halftime spike rates
    halftimeEntries: 2,
    halftimeExits: 150,
    halftimeConcessionSpike: 500, // Density spike at ZONE_B
    
    // Base zone population logic (randomized base + variance)
    baseDensity: 150, 
    densityVariance: 100,

    // Timing
    trafficIntervalMs: 2000,
    halftimeDurationMs: 20000,
    halftimeStartDelayMs: 10000
};

export class VenueSimulation {
    private interval: NodeJS.Timeout | null = null;
    private isHalftime = false;

    public start() {
        log.info('Starting VenueOS Simulation...');

        // 0. Initial Baseline Population (Pre-fill the stadium so it isn't empty)
        ingestionService.ingestAccessPulse('GATE_MAIN', AccessType.ENTRY, 35000).catch(e => log.error('Failed to pre-fill stadium'));

        // 1. Regular Traffic Loop
        this.interval = setInterval(() => {
            this.generateTraffic();
        }, DemoConfig.trafficIntervalMs);

        // 2. Interpolation Watchdog (Every 5s)
        setInterval(() => {
            ingestionService.checkAndInterpolate();
        }, 5000);

        // 3. Error Injection (Every 30s)
        setInterval(() => {
            this.injectErrors();
        }, 30000);
    }

    public triggerHalftime(active: boolean) {
        this.isHalftime = active;
        log.warn({ isHalftime: active }, 'SIMULATION_STATE_CHANGE: Halftime mode');
    }

    private async generateTraffic() {
        // Gates (Entries/Exits)
        const entries = this.isHalftime ? DemoConfig.halftimeEntries : DemoConfig.baseEntries;
        const exits = this.isHalftime ? DemoConfig.halftimeExits : DemoConfig.baseExits;
        
        for (let i = 0; i < entries; i++) {
            await ingestionService.ingestAccessPulse(`GATE_${Math.floor(Math.random() * 10)}`, AccessType.ENTRY);
        }
        for (let i = 0; i < exits; i++) {
            await ingestionService.ingestAccessPulse(`GATE_${Math.floor(Math.random() * 10)}`, AccessType.EXIT);
        }

        // Zone Sensed Data
        const zones = [
            'N', 'S', 'E', 'W', 
            'NE', 'NW', 'SE', 'SW'
        ];
        
        for (const zoneId of zones) {
            // High density spike in Concessions (East/West) during halftime
            const isConcourse = zoneId === 'E' || zoneId === 'W';
            const spike = (this.isHalftime && isConcourse) ? DemoConfig.halftimeConcessionSpike : 0;
            const base = DemoConfig.baseDensity + Math.floor(Math.random() * DemoConfig.densityVariance);
            
            await ingestionService.ingestSensedCrowd(
                zoneId, 
                ZoneType.CONCOURSE, 
                base + spike, 
                0.9 // High confidence
            );
        }
    }

    private async injectErrors() {
        log.info('Injecting malformed event for DLQ verification...');
        // @ts-ignore - explicitly passing bad data
        await ingestionService.ingestSensedCrowd('INVALID_ZONE', ZoneType.GATE, -100, 5.0);
    }
}

export const simulation = new VenueSimulation();
