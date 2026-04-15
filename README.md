# VenueOS C2

VenueOS C2 (Command & Control) is the operating system for physical venues. Just like Android or Windows manages apps, resources, and user interactions—VenueOS manages people, movement, and real-time decisions inside a venue. Not just dashboards. Not just alerts. Control. Coordination. Optimization.

Designed to handle large-scale sporting events with high architectural limits, VenueOS C2 actively targets crowd telemetry, localized mathematical density congestion, long queues, and precise topological metrics.

## ✨ Features

- **Real-Time Crowd Telemetry**: High-throughput ingestion of turnstile access pulses and raw spatial density data tracking exact global limits (SPACE LEFT algorithms).
- **Intelligent Alerting via Hysteresis**: Stateful congestion alerts that prevent "flapping." Real-time dynamic scaling tracks raw populations and generates `alert.crowd` incidents safely. Alerts auto-clear based on live density without waiting for backend recovery cycles.
- **Hard Capacity Enforcement**: Once the venue reaches maximum capacity (35,374), all gate entry pulses are rejected at the processing layer. A full-width emergency banner appears on the dashboard.
- **Gate Closure Visualization**: When a zone exceeds the congestion threshold, its entry gates are visually locked on the 3D map (`🚫 ENTRY CLOSED`) and flagged in the incident feed, so operators know exactly which access points to manage.
- **Queue Prediction (M/M/1 Modeling)**: Calculates live expected wait times at points of interest (food stalls, restrooms) based on arrival (λ) and service (μ) rates.
- **Resilient Notification Governor**: Outbound coordination messages are rate-limited, guarded by Circuit Breakers (`opossum`), and tuned by a "Compliance Decay" projection to prevent user fatigue.
- **High-Fidelity Operator Dashboard (C2)**: A real-time, interactive, **mobile-first** UI with a `three.js` 3D stadium model, zone alert pulsing, interactive click-to-inspect panels, and a synchronized WebSocket incident feed.
- **Self-Healing Infrastructure**: In-memory EventBus with built-in backpressure, automated missing-data interpolation, and a Redis-backed Dead Letter Queue (DLQ).

## Architecture

VenueOS is built using a decoupled, event-driven architecture for maximum resilience and throughput.

```text
[ Turnstiles / Cameras / App ] 
            |
            v
[ Crowd Ingestion Svc ] --(Normalization / SMA Smoothing)--> [ EventBus ]
                                                                 |
                                +--------------------------------+--------------------------------+
                                |                                                                 |
                                v                                                                 v
                    [ Crowd Processing Engine ]                                      [ Queue Prediction Svc ]
                    (Occupancy / Hysteresis /                                            (M/M/1 Model)
                     Hard Capacity Cap)
                                |                                                                 |
                                +--------------------------------+--------------------------------+
                                                                 |
                                                                 v
                                                     [ Dashboard API / WS ]  <---- [ API Gateway (Rate Limiting) ]
                                                                 |                                ^
                                                                 v                                |
                                                    [ Operator Dashboard UI ] --------------------+
                                                   (3D Map / Alerts / Gate Status)
```

## Getting Started

### Prerequisites
- **Node.js** (v20+ recommended)
- **Redis** running locally (default: `redis://localhost:6379`)

### Installation & Execution

1. **Start Redis** (if not already running):
   ```bash
   # Example using Docker
   docker run -d -p 6379:6379 redis
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

3. **Start the System**:
   ```bash
   npm start
   ```
   *This single command uses `concurrently` to spin up the Backend, the Scripted Demo Simulation Engine, the API Gateway, and the Vite-powered Operator Dashboard.*

4. **Access the Dashboard**:
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🎬 Demo Scenario Walkthrough

When you run `npm start`, the system automatically runs a scripted **9-phase demo sequence** that cycles through every observable system state. The sequence loops continuously so you can demo it at any time.

Watch your server logs for phase banners like:
```
──────────────────────────────────────────────────────────
  ⚽ PHASE 3: MATCH START — Steady occupancy, N & SW hotspots emerge
──────────────────────────────────────────────────────────
```

### Phase Timeline

| Phase | Name | Duration | What to Observe |
|-------|------|----------|-----------------|
| **1** | 🏟️ Pre-Event | ~2s | Stadium at 34% fill. All zones show cool blue/green. No alerts. Baseline established. |
| **2** | 🚶 Arrival Surge | ~2s | Rapid gate entries. Occupant counter climbs. Heatmap warms uniformly across zones. |
| **3** | ⚽ Match Start | ~40s | Steady ~70% occupancy. **N (North)** and **SW (Southwest)** zones spike above 80%. HIGH alerts fire. `🚫 ENTRY CLOSED` labels appear on those zones. |
| **4** | 🔴 Critical Congestion | ~30s | Burst of 8,000 entries drives venue near capacity. SW hits CRITICAL (deep red pulse). N hits HIGH. A third zone (SE) may also alert. Entry pulses are **rejected at the processing layer**. |
| **5** | ⛈️ Multi-Zone Incident | ~30s | Simulates a rain delay or emergency. Six zones simultaneously exceed threshold. Multiple `🚫 GATE CLOSED` labels appear. Incident Feed fills with stacked alerts. |
| **6** | 🍺 Halftime Exodus | ~35s | 200 exits per tick. Occupant counter drops rapidly. **3D heatmap cools in real time.** Alert pulses stop. Gate labels clear. Incident Feed empties. Concourse zones (E, W) spike briefly for concessions. |
| **7** | ⚽ Second Half | ~40s | 50 entries per tick — gradual refill. N and SW warm back up. Alerts re-trigger as density climbs above 80% again. |
| **8** | 🏁 End of Match | ~40s | 300 exits per tick. stadium drains visibly. All zones cool. Alerts self-clear as density drops below 80%. |
| **9** | ✅ Post-Event | ~20s | Near-empty venue. All clear. System nominal. → **Loops back to Phase 1.** |

---

## 🖥️ Dashboard Features

### 3D Isometric Stadium Map
- **Rotate**: Click and drag
- **Zoom**: Scroll / pinch (mobile)
- **Click a zone**: Expands the slice outward and shows a details panel with zone name and section map
- **Hover**: Shows a tooltip with capacity % and section count

### Zone Alert Visualization
- **Normal** → Zone colour reflects crowd density (blue → amber → red scale)
- **HIGH alert** → Zone pulses orange-red; `🚫 ENTRY CLOSED` label appears
- **CRITICAL alert** → Zone pulses bright red at higher frequency
- **Alert cleared** → Zone snaps back to density heatmap colour immediately

### Metric Pills (Header)
| Pill | Description |
|------|-------------|
| **Occupants** | Live global headcount, hard-capped at 35,374 |
| **Space Left** | Remaining capacity (goes to 0 and stays there at max) |
| **Warnings** | Count of currently active zone alerts |

### Incident Feed
- Every HIGH/CRITICAL alert creates a card with: zone ID, severity badge, `🚫 GATE CLOSED` pill, timestamp, and action buttons (RE-ROUTE / DEPLOY STAFF)
- Clicking a card selects that zone on the 3D map
- Cards auto-remove when alerts clear

### Venue Capacity Banner
When the venue hits maximum capacity, a full-width red banner pins to the top of the screen:
> 🔒 VENUE AT MAXIMUM CAPACITY — ALL ENTRY GATES LOCKED — NO FURTHER INGRESS PERMITTED

---

## The Science Under the Hood

### 1. Zone-Aware Reachability (Phantom Load)
Not all attendees have the venue app. VenueOS applies a dynamic multiplier to sensed data based on zone context (e.g., Gates: 1.8×, Concourse: 1.5×) to estimate true crowd density accurately.

### 2. Real Occupancy-Coupled Zone Sensors
Zone density sensors are not simulated independently — they read from the **live Redis occupancy counter** on every tick. This means gate exits immediately cause the 3D heatmap to cool across all zones, not just the global metrics.

### 3. Hard Capacity Enforcement (Two-Layer)
- **Layer 1 (Pre-check)**: Entry pulses are blocked before Redis is touched if `currentOccupancy >= GLOBAL_MAX_CAPACITY`
- **Layer 2 (Safety net)**: After any increment, if the counter exceeds capacity due to a race condition, it is clamped back to max

### 4. Density Auto-Clear (Frontend)
The 3D alert pulse stops as soon as density drops below **80%** — without waiting for the backend hysteresis recovery cycle. The incident feed and gate status are updated in the same event frame.

### 5. M/M/1 Queuing Theory
Wait times are modeled mathematically:
- $W = 1 / (\mu - \lambda)$
- If the queue becomes unstable (Arrival Rate ≥ Service Rate), the system falls back to a heuristic: `CurrentLength × AvgServiceTime`

### 6. Compliance Decay Curve
To prevent spamming users after issuing a crowd diversion:
- $P(t) = D_{init} \cdot (1 - (R_{zone} \cdot C_{base} \cdot e^{-\lambda t}))$
- Alerts are temporarily suppressed based on an exponential decay curve projecting when density will naturally fall.

---

## Tech Stack
- **Backend**: TypeScript, Node.js, Express, `ws` (WebSockets), `ioredis`, `pino` (Structured Logging), `opossum` (Circuit Breakers)
- **Frontend**: Vite, TypeScript, Three.js, Vanilla CSS (Glassmorphism / Mobile-first responsive design)
- **Infrastructure**: Redis (occupancy state), Docker-compatible
