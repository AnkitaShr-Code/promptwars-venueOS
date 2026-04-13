import { AccessType, ZoneType } from '../../shared/types.js';
export declare class CrowdIngestionService {
    private lastUpdateBuffer;
    private smaWindow;
    private readonly WINDOW_SIZE;
    private readonly INTERPOLATION_GAP_MS;
    /**
     * Handles a turnstile/gate entry or exit pulse
     */
    ingestAccessPulse(gateId: string, accessType: AccessType, count?: number): Promise<void>;
    /**
     * Handles noisy sensor data (e.g. Camera or GPS counts)
     */
    ingestSensedCrowd(zoneId: string, zoneType: ZoneType, rawCount: number, confidence: number): Promise<void>;
    /**
     * Watchdog method to interpolate missing data points
     */
    checkAndInterpolate(): Promise<void>;
}
export declare const ingestionService: CrowdIngestionService;
