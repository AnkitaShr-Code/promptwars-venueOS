import { AccessEvent, SensedCrowdEvent } from '../../shared/types.js';
export declare class CrowdProcessingEngine {
    private readonly OCCUPANCY_KEY;
    private readonly ALERT_PREFIX;
    private readonly DIVERSION_PREFIX;
    constructor();
    private initializeSubscriptions;
    /**
     * Updates the ground-truth occupancy tally
     */
    handleAccessEvent(event: AccessEvent): Promise<void>;
    /**
     * Processes spatial density and manages hysteresis alerts
     */
    handleSensedEvent(event: SensedCrowdEvent): Promise<void>;
    private applyComplianceDecay;
    private triggerAlert;
    private clearAlert;
}
export declare const processingEngine: CrowdProcessingEngine;
