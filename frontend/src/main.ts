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

    clickPanel.style.opacity = '1';
};

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
            // Pipe density data into 3D heat map
            engine.updateZoneHeat(event.zoneId, event.density);
        }
        if (event.totalOccupancy !== undefined) {
            occupancyText.innerText = event.totalOccupancy.toLocaleString();
            if (spaceLeftText) {
                spaceLeftText.innerText = Math.max(0, TOTAL_CAPACITY - event.totalOccupancy).toLocaleString();
            }
        }
    } else if (event.type === 'alert.crowd') {
        addAlert(event);
    }
}

function addAlert(event: VenueEvent) {
    if (activeAlerts === 0) {
        alertsFeed.innerHTML = ''; // Clear "No active incidents" text
    }

    const isCleared = event.severity === 'LOW';
    const alertId = `alert-${event.zoneId}`;
    
    const existingAlert = document.getElementById(alertId);

    if (isCleared) {
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

    // It's a new or existing active alert
    const timeStr = new Date(event.timestamp).toLocaleTimeString();
    
    if (!existingAlert) {
        activeAlerts++;
        alertsCountText.innerText = activeAlerts.toString();
        
        const div = document.createElement('div');
        div.id = alertId;
        div.className = 'alert-item p-3 rounded-lg text-xs flex justify-between items-start pointer-events-auto';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div>
                <strong class="text-amber-400 drop-shadow-neon-amber text-[10px] tracking-widest">${event.zoneId} BOTTLENECK</strong>
                <p class="text-slate-300 mt-1">${event.message}</p>
                <div class="mt-2 flex gap-2">
                    <button class="bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/40 px-2 py-1 rounded text-[10px] tracking-wider transition-colors cursor-pointer pointer-events-auto">RE-ROUTE</button>
                    <button class="bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/40 px-2 py-1 rounded text-[10px] tracking-wider transition-colors cursor-pointer pointer-events-auto">DEPLOY STAFF</button>
                </div>
            </div>
            <span class="text-[9px] text-slate-500">${timeStr}</span>
        `;
        
        // Let clicking the alert itself select the zone in the 3D engine
        div.addEventListener('click', (e) => {
            // Prevent triggering if clicking the action buttons
            if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                engine.selectZone(event.zoneId);
            }
        });

        alertsFeed.prepend(div);
    }
}
