export type SchemaVersion = '1.0.0';

export enum ZoneType {
    GATE = 'GATE',
    CONCOURSE = 'CONCOURSE',
    STALL = 'STALL'
}

export interface BaseEvent {
    schemaVersion: SchemaVersion;
    correlationId: string;
    timestamp: number;
    servicePath: string[];
}

export enum AccessType {
    ENTRY = 'ENTRY',
    EXIT = 'EXIT'
}

export interface AccessEvent extends BaseEvent {
    type: 'venue.access';
    accessType: AccessType;
    gateId: string;
    count: number;
}

export interface SensedCrowdEvent extends BaseEvent {
    type: 'sensed.crowd';
    zoneId: string;
    zoneType: ZoneType;
    count: number;
    confidence: number;
}

export interface VenueStateUpdate extends BaseEvent {
    type: 'update.venue';
    zoneId?: string; // Optional for global state updates
    totalOccupancy?: number;
    density?: number;
    flowRate?: number;
}

export interface CongestionAlert extends BaseEvent {
    type: 'alert.crowd';
    zoneId: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
}

export interface QueueStateUpdate extends BaseEvent {
    type: 'update.queue';
    stallId: string;
    waitTimeSec: number;
    queueLength: number;
    lambda: number;
    mu: number;
}

export enum HealthTier {
    FULL = 'FULL',
    DEGRADED = 'DEGRADED',
    MINIMAL = 'MINIMAL'
}

export interface DashboardMetrics extends BaseEvent {
    type: 'metrics.dashboard';
    alertsTriggered: number;
    notificationsSent: number;
    notificationsSuppressed: number;
    systemHealth: HealthTier;
    totalOccupancy: number;
}

export interface QueuePulseEvent extends BaseEvent {
    type: 'queue.pulse';
    stallId: string;
    pulseType: 'ARRIVAL' | 'DEPARTURE';
}

export interface OperatorNotification extends BaseEvent {
    type: 'notification.sent';
    message: string;
    category: 'redirect' | 'info' | 'dispatch';
}

export interface ExitGuidanceEvent extends BaseEvent {
    type: 'exit.guidance';
    zoneId: string;
    exitGate: string;
    alternateEntry: string;
    reason: string;
}

export type VenueEvent = 
    | AccessEvent
    | SensedCrowdEvent 
    | VenueStateUpdate 
    | CongestionAlert 
    | QueueStateUpdate 
    | QueuePulseEvent
    | DashboardMetrics
    | OperatorNotification
    | ExitGuidanceEvent;
