export declare class NotificationService {
    private pushBreaker;
    private readonly FATIGUE_TTL;
    constructor();
    private handleAlert;
    /**
     * Simulated external push notification provider (e.g. Firebase, OneSignal)
     */
    private mockPushProvider;
}
export declare const notificationService: NotificationService;
