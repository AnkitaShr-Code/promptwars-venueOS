import { Engine3D, STADIUM_DATA } from './engine3d.js';

const TOTAL_CAPACITY = STADIUM_DATA.zones.reduce((sum, zone) => sum + zone.capacity, 0);

// VenueEvent schemas
interface VenueEvent {
    type: string;
    correlationId: string;
    timestamp: number;
    [key: string]: any;
}

// 1. Initialize 3D Engine
const engine = new Engine3D('canvas-container');

// 1.5 Setup Tooltips
const hoverTooltip = document.getElementById('hover-tooltip')!;
const tooltipName = document.getElementById('tooltip-name')!;
const tooltipCap = document.getElementById('tooltip-cap')!;
const tooltipDen = document.getElementById('tooltip-den')!;

const clickPanel = document.getElementById('click-panel')!;
const clickName = document.getElementById('click-name')!;
const clickSections = document.getElementById('click-sections')!;

engine.onHoverZone = (data, screenPos) => {
    if (!data || !screenPos) {
        hoverTooltip.style.opacity = '0';
        return;
    }
    
    tooltipName.innerText = data.name;
    tooltipCap.innerText = `CAP: ${data.capacity.toLocaleString()}`;
    // density ratio (simulated as currentDensity / 1.0 logic from Processing)
    const pct = Math.round((data.currentDensity || 0) * 100);
    tooltipDen.innerText = `${pct}% CROWDED`;
    tooltipDen.className = pct > 80 ? 'font-bold text-amber-400' : 'font-bold text-cyan-500';

    hoverTooltip.style.left = `${screenPos.x}px`;
    hoverTooltip.style.top = `${screenPos.y}px`;
    hoverTooltip.style.opacity = '1';
};

engine.onClickZone = (data) => {
    if (!data) {
        clickPanel.style.opacity = '0';
        return;
    }

    clickName.innerText = data.name;
    const colorHex = data.color;
    
    // Build badges
    clickSections.innerHTML = data.sections.map((sec: number) => 
        `<span style="background-color: ${colorHex}40; border-color: ${colorHex}; color: ${colorHex}" class="border border-solid px-2 py-1 rounded shadow-sm drop-shadow-md">
            Sec ${sec}
        </span>`
    ).join('');

    // Dynamic Positioning for responsiveness
    if (window.innerWidth <= 768) {
        clickPanel.style.left = '';
        clickPanel.style.top = '';
    } else {
        clickPanel.style.left = '340px';
        clickPanel.style.top = '150px';
    }

    clickPanel.style.opacity = '1';
    // Never block pointer events - clicks must pass through to the 3D canvas
    clickPanel.style.pointerEvents = 'none';
};

// 1.7 Mobile Toggles (Bottom Sheet logic)
const mobileToggle = document.getElementById('mobile-toggle')!;
const feedSidebar = document.getElementById('feed-sidebar')!;

mobileToggle.addEventListener('click', () => {
    const isActive = feedSidebar.classList.contains('active');
    if (!isActive) {
        feedSidebar.classList.add('active');
        mobileToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    } else {
        feedSidebar.classList.remove('active');
        mobileToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
    }
});

// 2. HUD Elements
const occupancyText = document.getElementById('total-occupancy')!;
const spaceLeftText = document.getElementById('space-left')!;
const alertsCountText = document.getElementById('active-alerts-count')!;
const alertsFeed = document.getElementById('alerts-feed')!;
const connectionStatus = document.getElementById('connection-status')!;

// 3. Connect WebSockets
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = isLocal ? `${window.location.hostname}:3001` : window.location.host;
const ws = new WebSocket(`${protocol}//${wsHost}`);

let activeAlerts = 0;

ws.onopen = () => {
    connectionStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse drop-shadow-neon"></span> SECURE LINK`;
    connectionStatus.className = 'flex items-center gap-2 text-xs font-bold text-green-400';
};

ws.onclose = () => {
    connectionStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-500 drop-shadow-neon"></span> DISCONNECTED`;
    connectionStatus.className = 'flex items-center gap-2 text-xs font-bold text-red-500';
};

ws.onmessage = (msg) => {
    try {
        const event: VenueEvent = JSON.parse(msg.data);
        handleEvent(event);
    } catch (e) {
        console.error('Failed to parse WebSocket message', e);
    }
};

function handleEvent(event: VenueEvent) {
    if (event.type === 'update.venue') {
        if (event.zoneId && event.density !== undefined) {
            const wasAlerted = engine.isZoneAlerted(event.zoneId);
            engine.updateZoneHeat(event.zoneId, event.density);

            // Engine may have auto-cleared the alert (density < 0.8).
            // If so, sync the UI: remove card from feed, decrement counter, and reopen gates.
            if (wasAlerted && !engine.isZoneAlerted(event.zoneId)) {
                engine.setZoneGateClosed(event.zoneId, false);
                const alertId = `alert-${event.zoneId}`;
                const existingAlert = document.getElementById(alertId);
                if (existingAlert) {
                    existingAlert.remove();
                    activeAlerts = Math.max(0, activeAlerts - 1);
                    alertsCountText.innerText = activeAlerts.toString();
                }
                if (activeAlerts === 0) {
                    alertsFeed.innerHTML = '<div class="text-slate-500 italic text-center py-6 text-xs">No active incidents</div>';
                }
            }
        }
        if (event.totalOccupancy !== undefined) {
            occupancyText.innerText = event.totalOccupancy.toLocaleString();
            if (spaceLeftText) {
                spaceLeftText.innerText = Math.max(0, TOTAL_CAPACITY - event.totalOccupancy).toLocaleString();
            }
        }
    } else if (event.type === 'alert.crowd') {
        addAlert(event);
    } else if (event.type === 'update.queue') {
        updateQueueCard(event);
    } else if (event.type === 'notification.sent') {
        showNotification(event);
    } else if (event.type === 'exit.guidance') {
        updateExitGuidanceCard(event);
    }
}

// ── Exit Guidance Cards ───────────────────────────────────────────────────
function updateExitGuidanceCard(event: VenueEvent) {
    if (event.type !== 'exit.guidance') return;
    
    const cardId = `exit-${event.zoneId}`;
    let card = document.getElementById(cardId);
    const color = '#38bdf8'; // cyan-400 style for guidance

    if (!card) {
        card = document.createElement('div');
        card.id = cardId;
        card.className = 'alert-item p-2 rounded-lg text-xs pointer-events-auto';
        card.style.borderLeftColor = color;
        alertsFeed.prepend(card);
    }
    
    card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="flex:1">
                <strong style="color:${color};font-size:10px;letter-spacing:0.08em">📍 EXIT GUIDANCE: ${event.zoneId}</strong>
                <p class="text-white font-bold" style="margin:4px 0">🚪 Use EXIT: ${event.exitGate}</p>
                <p class="text-slate-400" style="font-size:10px">Alternate Entry: ${event.alternateEntry}</p>
                <p class="text-slate-500 italic mt-1" style="font-size:9px">${event.reason}</p>
            </div>
            <span class="text-[9px] text-slate-500 ml-2">${new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
    `;
    
    // Highlight the zone in 3D when card arrives
    engine.selectZone(event.zoneId);
}

// ── Queue Wait Time Cards ─────────────────────────────────────────────────
function updateQueueCard(event: VenueEvent) {
    const cardId = `queue-${event.stallId}`;
    let card = document.getElementById(cardId);
    const waitMin = Math.ceil(event.waitTimeSec / 60);
    const isLong = waitMin >= 8;
    const color = isLong ? '#f59e0b' : '#38bdf8';

    if (!card) {
        card = document.createElement('div');
        card.id = cardId;
        card.className = 'alert-item p-2 rounded-lg text-xs pointer-events-auto';
        card.style.borderLeftColor = color;
        alertsFeed.prepend(card);
    }
    card.style.borderLeftColor = color;
    card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
                <strong style="color:${color};font-size:10px;letter-spacing:0.08em">🕐 ${event.stallId}</strong>
                <p class="text-slate-300" style="margin:2px 0 0">${event.queueLength} people • Est. wait: <b style="color:${color}">${waitMin} min</b></p>
            </div>
            <span class="text-[9px] text-slate-500">${new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
    `;
}

// ── Operator Notification Toast ───────────────────────────────────────────
function showNotification(event: VenueEvent) {
    const div = document.createElement('div');
    div.className = 'alert-item p-2 rounded-lg text-xs pointer-events-auto';
    div.style.borderLeftColor = '#22c55e';
    div.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px">📢</span>
            <span style="color:#22c55e;font-size:10px;letter-spacing:0.06em;font-weight:700">${event.message}</span>
            <span class="text-[9px] text-slate-500 ml-auto">${new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
    `;
    alertsFeed.prepend(div);
    // Auto-remove after 6 seconds
    setTimeout(() => div.remove(), 6000);
}


function addAlert(event: VenueEvent) {
    const isCleared = event.severity === 'LOW';
    const isVenueLevel = event.zoneId === 'VENUE';
    // ── Venue-level capacity alert: toggle a full HUD banner ──────────────────
    if (isVenueLevel) {
        let banner = document.getElementById('venue-capacity-banner');
        const zones = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

        if (isCleared) {
            banner?.remove();
            // Reopen all gates (individual zone-level alerts will still show as locked if active)
            zones.forEach(id => engine.setZoneGateClosed(id, false));
        } else if (!banner) {
            banner = document.createElement('div');
            banner.id = 'venue-capacity-banner';
            // ... (banner styling same as before)
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; z-index: 100;
                background: rgba(180,0,0,0.92); color: #fff;
                font-size: 12px; font-weight: 900; letter-spacing: 0.12em;
                text-align: center; padding: 8px 0; text-shadow: 0 0 10px #ff4444;
                pointer-events: none;
            `;
            banner.innerHTML = '🔒 VENUE AT MAXIMUM CAPACITY — ALL ENTRY GATES LOCKED — NO FURTHER INGRESS PERMITTED';
            document.body.prepend(banner);
            // Lock all gates
            zones.forEach(id => engine.setZoneGateClosed(id, true));
        }
        return;
    }

    // ── Zone-level alerts ─────────────────────────────────────────────────────
    if (activeAlerts === 0 && !isCleared) {
        alertsFeed.innerHTML = ''; // Clear "No active incidents" text
    }
    const alertId = `alert-${event.zoneId}`;
    const existingAlert = document.getElementById(alertId);

    if (isCleared) {
        // Restore zone heatmap color and reopen gates
        engine.setZoneAlert(event.zoneId, null);
        engine.setZoneGateClosed(event.zoneId, false);

        if (existingAlert) {
            existingAlert.remove();
            activeAlerts = Math.max(0, activeAlerts - 1);
            alertsCountText.innerText = activeAlerts.toString();
        }
        if (activeAlerts === 0) {
            alertsFeed.innerHTML = '<div class="text-slate-500 italic text-center py-6 text-xs">No active incidents</div>';
        }
        return;
    }

    // Activate pulsing alert color — always for HIGH and CRITICAL
    engine.setZoneAlert(event.zoneId, event.severity);
    
    // Toggle gate closure: ONLY for CRITICAL alerts.
    // If it was CRITICAL and is now HIGH, this will reopen the gates visually.
    const isCritical = event.severity === 'CRITICAL';
    engine.setZoneGateClosed(event.zoneId, isCritical);

    const borderColor = isCritical ? '#ef4444' : '#f59e0b';
    const badgeStyle = isCritical
        ? 'background:rgba(220,0,0,0.8);color:#fff;'
        : 'background:rgba(220,90,0,0.5);color:#fff;';
    const badgeHtml = isCritical 
        ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;${badgeStyle}letter-spacing:0.05em">🚫 GATE CLOSED</span>` 
        : `<span style="font-size:9px;padding:1px 5px;border-radius:3px;${badgeStyle}letter-spacing:0.05em">⚠️ CONGESTED</span>`;

    // Add card if it doesn't exist yet, or update existing one
    if (!existingAlert) {
        activeAlerts++;
        alertsCountText.innerText = activeAlerts.toString();
        const timeStr = new Date(event.timestamp).toLocaleTimeString();
        
        const div = document.createElement('div');
        div.id = alertId;
        div.className = 'alert-item p-3 rounded-lg text-xs flex justify-between items-start pointer-events-auto';
        div.style.borderLeftColor = borderColor;
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div style="flex:1">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    <strong style="color:${borderColor};font-size:10px;letter-spacing:0.1em">${event.zoneId} — ${event.severity}</strong>
                    ${badgeHtml}
                </div>
                <p class="text-slate-300">${event.message}</p>
                <div class="mt-2 flex gap-2">
                    <button class="bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/40 px-2 py-1 rounded text-[10px] tracking-wider transition-colors cursor-pointer pointer-events-auto">RE-ROUTE</button>
                    <button class="bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/40 px-2 py-1 rounded text-[10px] tracking-wider transition-colors cursor-pointer pointer-events-auto">DEPLOY STAFF</button>
                </div>
            </div>
            <span class="text-[9px] text-slate-500 ml-2">${timeStr}</span>
        `;

        div.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                engine.selectZone(event.zoneId);
            }
        });

        alertsFeed.prepend(div);
    } else {
        // Update existing alert card if severity transitioned (e.g. CRITICAL -> HIGH)
        existingAlert.style.borderLeftColor = borderColor;
        const timeStr = new Date(event.timestamp).toLocaleTimeString();
        existingAlert.innerHTML = `
            <div style="flex:1">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    <strong style="color:${borderColor};font-size:10px;letter-spacing:0.1em">${event.zoneId} — ${event.severity}</strong>
                    ${badgeHtml}
                </div>
                <p class="text-slate-300">${event.message}</p>
                <div class="mt-2 flex gap-2">
                    <button class="bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/40 px-2 py-1 rounded text-[10px] tracking-wider transition-colors cursor-pointer pointer-events-auto">RE-ROUTE</button>
                    <button class="bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/40 px-2 py-1 rounded text-[10px] tracking-wider transition-colors cursor-pointer pointer-events-auto">DEPLOY STAFF</button>
                </div>
            </div>
            <span class="text-[9px] text-slate-500 ml-2">${timeStr}</span>
        `;
    }
}
