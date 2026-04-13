// @ts-ignore
import { Gauge } from 'gauge.js';

interface VenueEvent {
    type: string;
    zoneId?: string;
    density?: number;
    totalOccupancy?: number;
    severity?: string;
    message?: string;
    timestamp: number;
}

const ZONES = [
    { id: 'ZONE_A', x: 100, y: 100, w: 200, h: 200, name: 'North Gate' },
    { id: 'ZONE_B', x: 400, y: 100, w: 200, h: 200, name: 'Concessions' },
    { id: 'ZONE_C', x: 100, y: 350, w: 200, h: 200, name: 'West Wing' },
    { id: 'ZONE_D', x: 400, y: 350, w: 200, h: 200, name: 'South Gate' }
];

const canvas = document.getElementById('heatmap-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const alertsFeed = document.getElementById('alerts-feed')!;
const occupancyText = document.getElementById('total-occupancy')!;
const alertsCountText = document.getElementById('active-alerts-count')!;
const connectionStatus = document.getElementById('connection-status')!;

const zoneStates = new Map<string, number>();
let activeAlerts = 0;

function init() {
    canvas.width = canvas.parentElement!.clientWidth;
    canvas.height = canvas.parentElement!.clientHeight;
    render();
    connect();
}

function connect() {
    // Port 3001 is Dashboard API (Direct for demo, Port 3000 is Gateway)
    const ws = new WebSocket('ws://localhost:3001');

    ws.onopen = () => {
        connectionStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Connected';
        connectionStatus.classList.remove('text-red-500');
    };

    ws.onmessage = (event) => {
        const data: VenueEvent = JSON.parse(event.data);
        handleEvent(data);
    };

    ws.onclose = () => {
        connectionStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Reconnecting...';
        setTimeout(connect, 3000);
    };
}

function handleEvent(event: VenueEvent) {
    if (event.type === 'update.venue') {
        if (event.zoneId && event.density !== undefined) {
            zoneStates.set(event.zoneId, event.density);
        }
        if (event.totalOccupancy !== undefined) {
            occupancyText.innerText = event.totalOccupancy.toLocaleString();
        }
    } else if (event.type === 'alert.crowd') {
        addAlert(event);
    }
    render();
}

function addAlert(event: VenueEvent) {
    if (event.severity === 'LOW' && event.message?.includes('cleared')) {
       // Clear logic would go here, for demo we just add a "Cleared" message
    } else {
        activeAlerts++;
        alertsCountText.innerText = activeAlerts.toString();
    }

    const item = document.createElement('div');
    item.className = 'alert-item p-3 glass-card rounded-lg border-l-4 border-amber-500 text-sm';
    item.innerHTML = `
        <div class="flex justify-between mb-1">
            <span class="font-bold text-amber-500">${event.severity} ALERT</span>
            <span class="text-slate-500 text-[10px]">${new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
        <p class="text-white">${event.message} <span class="text-cyan-400">@ ${event.zoneId}</span></p>
    `;
    
    if (alertsFeed.children.length > 5) alertsFeed.removeChild(alertsFeed.lastChild!);
    alertsFeed.prepend(item);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ZONES.forEach(zone => {
        const density = zoneStates.get(zone.id) || 0;
        
        // Heat Color Mapping
        const alpha = 0.2 + (density * 0.6);
        const hue = 120 - (density * 120); // 120 (Green) to 0 (Red)
        
        ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha})`;
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        
        ctx.strokeStyle = density > 0.8 ? '#f43f5e' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '10px Inter';
        ctx.fillText(zone.id, zone.x + 5, zone.y + 15);
        ctx.fillText(`${Math.round(density * 100)}% Capacity`, zone.x + 5, zone.y + 28);
    });
}

window.addEventListener('resize', () => {
    canvas.width = canvas.parentElement!.clientWidth;
    canvas.height = canvas.parentElement!.clientHeight;
    render();
});

init();
