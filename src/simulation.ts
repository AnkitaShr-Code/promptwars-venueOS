import { ingestionService } from './services/ingestion/index.js';
import { AccessType, ZoneType, OperatorNotification } from './shared/types.js';
import { createLogger, getCorrelationId } from './shared/logger.js';
import { eventBus } from './shared/event-bus.js';
import { redis } from './shared/redis.js';

const log = createLogger('Simulation');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const TOTAL_CAPACITY = 35374;
const OCCUPANCY_KEY  = 'venue:occupancy';
const TICK_MS        = 1500; // Faster ticks for a tight 32s demo

const ZONE_CAPS: Record<string, number> = {
    'N': 7858, 'NE': 3169, 'E': 4697, 'SE': 3148,
    'S': 5880, 'SW': 3220, 'W': 4253, 'NW': 3149
};

// ─────────────────────────────────────────────────────────────────────────────
// 7-ACT VENUE LIFECYCLE — 32 SECONDS
// ─────────────────────────────────────────────────────────────────────────────
//
// Act 1 (0-4s)   Gates Open         — trickle at N & E, 5-15% density
// Act 2 (4-9s)   Steady Fill        — all zones climb, queue forms, notification fires
// Act 3 (9-14s)  Pre-Event Rush     — W hits 88% HIGH, queue surges, gate closure
// Act 4 (14-18s) Full House         — 97% capacity, all zones hot, SE spike + staff dispatch
// Act 5 (18-22s) Crowd Settles      — density drops to 20-30%, alerts clear via hysteresis
// Act 6 (22-27s) Exodus             — mass exit, S & E spike briefly, redirect notification
// Act 7 (27-32s) Arena Clear        — all zones back to 0-5%, loop resets
// ─────────────────────────────────────────────────────────────────────────────

interface Act {
    name: string;
    durationMs: number;
    entriesPerTick: number;
    exitsPerTick: number;
    zoneBoosts: Record<string, number>;
    // Queue simulation: stall arrivals/departures per tick
    queueArrivals?: Record<string, number>;
    queueDepartures?: Record<string, number>;
    // One-time events fired when the act starts
    onStart?: () => Promise<void>;
}

const ACTS: Act[] = [
    // ═══════════════════════════════════════════════════════════════════════════
    // ACT 1: GATES OPEN (0–4s)
    // Trickle of people at Gate North and Gate East. Density 5–15%.
    // System is baseline green. Shows the ingestion pipeline is live.
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: '🚪 ACT 1: GATES OPEN — Trickle at Gate N & Gate E. Density 5–15%.',
        durationMs: 4_000,
        entriesPerTick: 5,
        exitsPerTick: 0,
        zoneBoosts: { 'N': 0.03, 'E': 0.02 },  // Slight warmth at entry gates
        queueArrivals: {},
        queueDepartures: {},
        onStart: async () => {
            // Seed with very low occupancy — ~5%
            await redis.set(OCCUPANCY_KEY, '1800');
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ACT 2: STEADY FILL (4–9s)
    // All 8 zones climbing. E hits 55%. Queue at Food Stall 3 forms —
    // wait time prediction kicks in. Notification: "Stall 7 has no queue."
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: '📈 ACT 2: STEADY FILL — All zones climbing. Queue forms at Food Stall 3.',
        durationMs: 5_000,
        entriesPerTick: 40,
        exitsPerTick: 3,
        zoneBoosts: { 'E': 0.15 },  // E (concourse) warms faster
        queueArrivals: { 'Food Stall 3': 3 },  // 3 arrivals/tick → ~4 min wait
        queueDepartures: { 'Food Stall 3': 1 },
        onStart: async () => {
            // Seed 30% fill to accelerate the visual climb
            await ingestionService.ingestAccessPulse('GATE_N', AccessType.ENTRY, 8000);

            // Notification: Stall 7 has no queue
            await eventBus.publish({
                type: 'notification.sent',
                schemaVersion: '1.0.0',
                correlationId: getCorrelationId(),
                timestamp: Date.now(),
                servicePath: ['Simulation'],
                message: '📢 Stall 7 has no queue — redirect visitors from Stall 3',
                category: 'info'
            } as OperatorNotification);
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ACT 3: PRE-EVENT RUSH (9–14s)
    // Gates surge to 80%+. W hits 88% → HIGH alert fires.
    // Queue at Stall 3 jumps to 22 people → 11 min wait.
    // Operator recommendation: close Gate West, redirect to Gate South.
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: '🏃 ACT 3: PRE-EVENT RUSH — W hits 88% HIGH. Gate W entry closure recommended.',
        durationMs: 5_000,
        entriesPerTick: 80,
        exitsPerTick: 3,
        zoneBoosts: { 'W': 0.48, 'N': 0.10, 'S': 0.05 },  // W is the hotspot
        queueArrivals: { 'Food Stall 3': 8 },   // Queue surges
        queueDepartures: { 'Food Stall 3': 1 },
        onStart: async () => {
            // Burst to ~60% fill
            await ingestionService.ingestAccessPulse('GATE_MAIN', AccessType.ENTRY, 7000);

            // Operator notification: redirect from W to S
            setTimeout(async () => {
                await eventBus.publish({
                    type: 'notification.sent',
                    schemaVersion: '1.0.0',
                    correlationId: getCorrelationId(),
                    timestamp: Date.now(),
                    servicePath: ['Simulation'],
                    message: '🔀 Crowd redirected: Gate W → Gate S. Gate W entry restricted.',
                    category: 'redirect'
                } as OperatorNotification);
            }, 2000);
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ACT 4: FULL HOUSE (14–18s)
    // Arena at 97% capacity. All zones MEDIUM or HIGH.
    // Heatmap fully red. Notifications throttled to HIGH-only.
    // SE (Restroom Block B) spikes → crowd control staff dispatched.
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: '🔴 ACT 4: TARGETED SPIKE — SE & NW zones hit CRITICAL. Others remain Green.',
        durationMs: 8_000,
        entriesPerTick: 10,  // Slow growth to maintain moderate global density
        exitsPerTick: 2,
        zoneBoosts: {
            'SE': 0.55, 'NW': 0.55, // Push these two to ~1.05-1.1 (CRITICAL)
            'N': -0.1, 'S': -0.1, 'E': -0.1, 'W': -0.1 // Keep others safely GREEN
        },
        queueArrivals: { 'Food Stall 3': 5 },
        queueDepartures: { 'Food Stall 3': 2 },
        onStart: async () => {
            // Seed global occupancy at ~50%
            await redis.set(OCCUPANCY_KEY, '18000');

            // 1. Force CRITICAL alerts for the two spike zones
            setTimeout(async () => {
                const affectedZones = ['SE', 'NW'];
                for (const zoneId of affectedZones) {
                    await eventBus.publish({
                        type: 'alert.crowd',
                        schemaVersion: '1.0.0',
                        correlationId: getCorrelationId(),
                        timestamp: Date.now(),
                        servicePath: ['Simulation'],
                        zoneId,
                        severity: 'CRITICAL',
                        message: `CRITICAL: ${zoneId} zone at capacity. Entry restricted.`
                    });

                    // 2. Publish dedicated Exit Guidance cards
                    await eventBus.publish({
                        type: 'exit.guidance',
                        schemaVersion: '1.0.0',
                        correlationId: getCorrelationId(),
                        timestamp: Date.now(),
                        servicePath: ['Simulation'],
                        zoneId,
                        exitGate: zoneId === 'SE' ? 'Gate 4' : 'Gate 1',
                        alternateEntry: zoneId === 'SE' ? 'Gate W' : 'Gate E',
                        reason: 'CRITICAL CONGESTION — Rerouting active.'
                    });
                }
            }, 2500);

            // Exit guidance notification summary
            setTimeout(async () => {
                await eventBus.publish({
                    type: 'notification.sent',
                    schemaVersion: '1.0.0',
                    correlationId: getCorrelationId(),
                    timestamp: Date.now(),
                    servicePath: ['Simulation'],
                    message: '🚪 EXIT GUIDANCE ACTIVE: SE & NW restricted. Check reroute cards.',
                    category: 'redirect'
                } as OperatorNotification);
            }, 3000);
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ACT 5: DE-ESCALATION (18–22s) — HIGH ALERT (Yellow)
    // Red zones drop to HIGH. Crowd redistributes.
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: '🟨 ACT 5: DE-ESCALATION — SE & NW drop to HIGH (Yellow).',
        durationMs: 5_000,
        entriesPerTick: 5,
        exitsPerTick: 40,
        zoneBoosts: {
            'SE': 0.35, 'NW': 0.35 // Drop to ~0.85-0.9 (HIGH)
        },
        queueArrivals: {},
        queueDepartures: { 'Food Stall 3': 4 },
        onStart: async () => {
            await eventBus.publish({
                type: 'notification.sent',
                schemaVersion: '1.0.0',
                correlationId: getCorrelationId(),
                timestamp: Date.now(),
                servicePath: ['Simulation'],
                message: '✅ SE & NW severity downgraded to HIGH. Monitoring flow.',
                category: 'info'
            } as OperatorNotification);
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ACT 6: EXODUS BEGINS (22–27s)
    // End-of-event drain. S and E spike briefly as everyone leaves.
    // System fires pre-emptive redirect: "Use Gate N — shorter exit queue."
    // Density falls from 95% → 40% → 10% across 5 seconds.
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: '🚶‍♂️ ACT 6: EXODUS — All zones clearing to Green.',
        durationMs: 5_000,
        entriesPerTick: 0,
        exitsPerTick: 500,   // Rapid drain
        zoneBoosts: {},      // Ensure everything turns Green
        queueArrivals: {},
        queueDepartures: { 'Food Stall 3': 5 },
        onStart: async () => {
            // Pre-emptive redirect notification
            await eventBus.publish({
                type: 'notification.sent',
                schemaVersion: '1.0.0',
                correlationId: getCorrelationId(),
                timestamp: Date.now(),
                servicePath: ['Simulation'],
                message: '🚪 Use Gate N — shorter exit queue. Gate S at capacity.',
                category: 'redirect'
            } as OperatorNotification);
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ACT 7: ARENA CLEAR + LOOP RESET (27–32s)
    // All zones back to 0–5%. Summary stats log. Reset and loop.
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: '✅ ACT 7: ARENA CLEAR — All zones 0–5%. System nominal. Resetting...',
        durationMs: 5_000,
        entriesPerTick: 0,
        exitsPerTick: 400,
        zoneBoosts: {},
        queueArrivals: {},
        queueDepartures: {},
        onStart: async () => {
            await eventBus.publish({
                type: 'notification.sent',
                schemaVersion: '1.0.0',
                correlationId: getCorrelationId(),
                timestamp: Date.now(),
                servicePath: ['Simulation'],
                message: '🏁 Arena clear. All systems nominal. Post-event lockdown released.',
                category: 'info'
            } as OperatorNotification);
        }
    }
];

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────
export class VenueSimulation {
    private tickInterval: NodeJS.Timeout | null = null;
    private currentAct = 0;
    private currentConfig: Act = ACTS[0];

    public start() {
        log.info('═══════════════════════════════════════════════════════════════');
        log.info('  VenueOS C2 — 7-ACT LIFECYCLE DEMO (32s loop)                ');
        log.info('═══════════════════════════════════════════════════════════════');

        // Reset Redis state
        redis.set(OCCUPANCY_KEY, '0').then(() => this.runAct(0));

        // Interpolation watchdog
        setInterval(() => ingestionService.checkAndInterpolate(), 5000);

        // Main traffic tick
        this.tickInterval = setInterval(() => this.generateTraffic(), TICK_MS);
    }

    private async runAct(index: number) {
        if (index >= ACTS.length) {
            log.info('════════════════════════════════════════════════════════');
            log.info('  DEMO COMPLETE — Looping back to Act 1                ');
            log.info('════════════════════════════════════════════════════════');
            // Reset occupancy for clean loop
            await redis.set(OCCUPANCY_KEY, '0');
            this.runAct(0);
            return;
        }

        const act = ACTS[index];
        this.currentAct = index;
        this.currentConfig = act;

        log.warn(`\n${'━'.repeat(64)}\n  ${act.name}\n${'━'.repeat(64)}`);

        // Fire one-time act start events
        if (act.onStart) {
            try { await act.onStart(); } catch (e) { log.error(e, 'Act onStart error'); }
        }

        // Schedule next act
        setTimeout(() => this.runAct(index + 1), act.durationMs);
    }

    private async generateTraffic() {
        const cfg = this.currentConfig;

        // ── Gate Access Events ────────────────────────────────────────────────
        for (let i = 0; i < cfg.entriesPerTick; i++) {
            await ingestionService.ingestAccessPulse(
                `GATE_${Math.floor(Math.random() * 10)}`, AccessType.ENTRY
            );
        }
        for (let i = 0; i < cfg.exitsPerTick; i++) {
            await ingestionService.ingestAccessPulse(
                `GATE_${Math.floor(Math.random() * 10)}`, AccessType.EXIT
            );
        }

        // ── Zone Density Sensors (coupled to real occupancy) ──────────────────
        const currentOccupancy = parseInt(await redis.get(OCCUPANCY_KEY) || '0', 10);
        const globalFillRatio = Math.min(currentOccupancy / TOTAL_CAPACITY, 1.0);

        const zones = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
        for (const zoneId of zones) {
            const cap = ZONE_CAPS[zoneId] || 3000;
            const boost = cfg.zoneBoosts[zoneId] || 0;
            const noise = Math.random() * 0.04 - 0.02; // ±2% jitter
            const targetDensity = globalFillRatio + boost + noise;
            const clampedDensity = Math.min(Math.max(targetDensity, 0), 1.25);

            // IngestionService applies 1.5x phantom multiplier → divide back
            const sensorCount = Math.floor(cap * (clampedDensity / 1.5));
            await ingestionService.ingestSensedCrowd(zoneId, ZoneType.CONCOURSE, sensorCount, 0.9);
        }

        // ── Queue Pulse Events (feed into M/M/1 prediction) ───────────────────
        if (cfg.queueArrivals) {
            for (const [stallId, count] of Object.entries(cfg.queueArrivals)) {
                for (let i = 0; i < count; i++) {
                    await eventBus.publish({
                        type: 'queue.pulse',
                        schemaVersion: '1.0.0',
                        correlationId: getCorrelationId(),
                        timestamp: Date.now(),
                        servicePath: ['Simulation'],
                        stallId,
                        pulseType: 'ARRIVAL'
                    });
                }
            }
        }
        if (cfg.queueDepartures) {
            for (const [stallId, count] of Object.entries(cfg.queueDepartures)) {
                for (let i = 0; i < count; i++) {
                    await eventBus.publish({
                        type: 'queue.pulse',
                        schemaVersion: '1.0.0',
                        correlationId: getCorrelationId(),
                        timestamp: Date.now(),
                        servicePath: ['Simulation'],
                        stallId,
                        pulseType: 'DEPARTURE'
                    });
                }
            }
        }
    }

    public triggerHalftime(_active: boolean) {
        log.warn('Manual trigger ignored during scripted demo');
    }
}

export const simulation = new VenueSimulation();
