export declare class VenueSimulation {
    private interval;
    private isHalftime;
    start(): void;
    triggerHalftime(active: boolean): void;
    private generateTraffic;
    private injectErrors;
}
export declare const simulation: VenueSimulation;
