export declare const STADIUM_DATA: {
    stadium: string;
    layout: string;
    totalSections: number;
    zones: {
        id: string;
        name: string;
        capacity: number;
        color: string;
        sections: number[];
    }[];
};
export declare class Engine3D {
    private scene;
    private camera;
    private renderer;
    private controls;
    private zones;
    private baseColors;
    private raycaster;
    private mouse;
    private hoveredMesh;
    private clickedMesh;
    onHoverZone: ((zoneData: any, screenPos: {
        x: number;
        y: number;
    } | null) => void) | null;
    onClickZone: ((zoneData: any) => void) | null;
    constructor(containerId: string);
    private setupLighting;
    private buildStadium;
    private onPointerMove;
    private onClick;
    updateZoneHeat(zoneId: string, density: number): void;
    private onWindowResize;
    private animate;
}
//# sourceMappingURL=engine3d.d.ts.map