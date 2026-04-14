import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// The explicit Configuration data
export const STADIUM_DATA = {
  "stadium": "Sports Arena",
  "layout": "circular",
  "totalSections": 48,
  "zones": [
    { "id": "N", "name": "North Stand", "capacity": 7858, "color": "#FF5733", "sections": [26,27,28,29,30,31,32,33] },
    { "id": "NE", "name": "North East Stand", "capacity": 3169, "color": "#FFC300", "sections": [34,35,36,37,38] },
    { "id": "E", "name": "East Stand", "capacity": 4697, "color": "#DAF7A6", "sections": [39,40,41,42,43,44] },
    { "id": "SE", "name": "South East Stand", "capacity": 3148, "color": "#85C1E9", "sections": [45,46,47,48] },
    { "id": "S", "name": "South Stand", "capacity": 5880, "color": "#2E86C1", "sections": [1,2,3,4,5,6,7,8] },
    { "id": "SW", "name": "South West Stand", "capacity": 3220, "color": "#7D3C98", "sections": [9,10,11,12,13] },
    { "id": "W", "name": "West Stand", "capacity": 4253, "color": "#E67E22", "sections": [14,15,16,17,18,19,20] },
    { "id": "NW", "name": "North West Stand", "capacity": 3149, "color": "#922B21", "sections": [21,22,23,24,25] }
  ]
};

export class Engine3D {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private zones: Map<string, THREE.Mesh> = new Map();
    private baseColors: Map<string, THREE.Color> = new Map();
    
    // Interactivity
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2(-9999, -9999);
    private hoveredMesh: THREE.Mesh | null = null;
    private clickedMesh: THREE.Mesh | null = null;
    private labels: Map<string, HTMLElement> = new Map();
    
    // Callbacks for UI
    public onHoverZone: ((zoneData: any, screenPos: {x: number, y: number} | null) => void) | null = null;
    public onClickZone: ((zoneData: any) => void) | null = null;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) throw new Error('Canvas container not found');

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x1e293b, 0.002);

        this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1500);
        this.camera.position.set(0, 450, 450); // Angled down

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2.2;
        this.controls.minDistance = 100;
        this.controls.maxDistance = 1000;

        this.setupLighting();
        this.buildStadium();

        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        // Raycasting events setup - attach to window to prevent OrbitControls interception
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onClick.bind(this));

        this.animate();
    }

    private setupLighting() {
        // Boost ambient lighting since scene was too dark
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        // Stronger directional light
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(200, 400, 100);
        this.scene.add(dirLight);
    }

    private buildStadium() {
        // Field (Green Pitch) visible!
        const fieldGeo = new THREE.CircleGeometry(89, 64);
        const fieldMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9, metalness: 0.1 });
        const field = new THREE.Mesh(fieldGeo, fieldMat);
        field.rotation.x = -Math.PI / 2;
        field.position.y = 5; // Raise it slightly so it doesn't z-fight with grid and is visibly placed inside the inner ring
        this.scene.add(field);

        // Center markings (light opacity)
        const gridHelper = new THREE.GridHelper(120, 10, 0xffffff, 0xffffff);
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        gridHelper.position.y = 5.2; // Above field
        this.scene.add(gridHelper);

        const innerRadius = 90;
        const outerRadius = 180;
        const height = 40;

        // Ensure 8 parts using specific ordering:
        // STADIUM_DATA zones map clockwise starting from North
        // Three.js CylinderGeometry starts from Z-axis (Math.PI/2) and goes CCW if we aren't careful,
        // Actually CylinderGeometry thetaStart = 0 is +X axis.
        // Let's manually map the start angles so they match geographic layout:
        // N is North (-Z direction). So center at -Z.
        // We will assign center angles in radians.
        
        const configAngles: Record<string, number> = {
            'N': Math.PI * 1.5,
            'NE': Math.PI * 1.75,
            'E': 0,
            'SE': Math.PI * 0.25,
            'S': Math.PI * 0.5,
            'SW': Math.PI * 0.75,
            'W': Math.PI,
            'NW': Math.PI * 1.25
        };

        STADIUM_DATA.zones.forEach((zoneCfg) => {
            const centerAngle = configAngles[zoneCfg.id] || 0;
            // Arc size: each covers 45 degrees (PI / 4), minus a tiny gap
            const arcLength = (Math.PI / 4) - 0.05; 
            const startAngle = centerAngle - (arcLength / 2);
            
            // Build geometry by drawing shape and extruding, 
            // or simply use RingGeometry, wait, CylinderGeometry handles "slice of a tube" well if we subtract the inner part?
            // Actually, CylinderGeometry with openEnded=false is a full cheese wheel wedge. We want a donut slice.
            // Let's create a custom shape:
            const shape = new THREE.Shape();
            shape.absarc(0, 0, outerRadius, startAngle, startAngle + arcLength, false);
            shape.absarc(0, 0, innerRadius, startAngle + arcLength, startAngle, true);
            
            const extrudeSettings = {
                depth: height,
                bevelEnabled: true,
                bevelSegments: 2,
                steps: 1,
                bevelSize: 1,
                bevelThickness: 1
            };
            
            const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geo.rotateX(Math.PI / 2);
            geo.translate(0, height, 0);
            
            // Explicitly compute bounds for reliable Raycasting calculations
            geo.computeBoundingSphere();
            geo.computeBoundingBox();

            const baseColor = new THREE.Color(zoneCfg.color);
            this.baseColors.set(zoneCfg.id, baseColor.clone());

            const mat = new THREE.MeshPhysicalMaterial({
                color: baseColor,
                transparent: true,
                opacity: 0.7,
                roughness: 0.3,
                metalness: 0.6,
                emissive: baseColor,
                emissiveIntensity: 0.2,
                transmission: 0.3
            });

            const mesh = new THREE.Mesh(geo, mat);
            
            const radialDir = new THREE.Vector3(Math.cos(centerAngle), 0, Math.sin(centerAngle)).normalize();
            
            mesh.userData = {
                ...zoneCfg,
                basePos: new THREE.Vector3(0, 0, 0),
                expandDir: radialDir,
                expanded: false,
                currentDensity: 0
            };

            this.zones.set(zoneCfg.id, mesh);
            this.scene.add(mesh);

            // Create a floating HTML Label for this zone
            const label = document.createElement('div');
            label.style.position = 'absolute';
            label.style.zIndex = '10';
            label.style.pointerEvents = 'none';
            label.style.color = '#ffffff';
            label.style.fontWeight = 'bold';
            label.style.fontSize = '11px';
            label.style.textAlign = 'center';
            label.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)';
            label.style.transform = 'translate(-50%, -50%)';
            label.style.transition = 'all 200ms ease';
            label.innerHTML = `${zoneCfg.name}<br/><span style="color:${zoneCfg.color}">${zoneCfg.id}</span>`;
            document.getElementById('canvas-container')?.appendChild(label);
            this.labels.set(zoneCfg.id, label);
        });
    }

    private onPointerMove(event: PointerEvent) {
        // Calculate mouse position bounded to the window
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    // Keep track of drag distance to prevent click trigging while orbiting
    private mouseDownPos = { x: 0, y: 0 };
    
    private onClick(event: PointerEvent) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(Array.from(this.zones.values()));
        const clickedTarget = intersects.length > 0 ? intersects[0].object as THREE.Mesh : null;
        this.selectZone(clickedTarget ? clickedTarget.userData.id : null);
    }

    public selectZone(zoneId: string | null) {
        const clickedTarget = zoneId ? this.zones.get(zoneId) || null : null;

        if (clickedTarget) {
            // Toggle expansion
            const target = clickedTarget;
            const expanding = !target.userData.expanded;
            
            // Retract others
            if (expanding && this.clickedMesh && this.clickedMesh !== target) {
                this.clickedMesh.userData.expanded = false;
                this.clickedMesh.position.copy(this.clickedMesh.userData.basePos);
            }

            target.userData.expanded = expanding;
            this.clickedMesh = expanding ? target : null;

            if (this.onClickZone) {
                this.onClickZone(expanding ? target.userData : null);
            }
        } else {
            // Clicked background -> Retract all
            if (this.clickedMesh) {
                this.clickedMesh.userData.expanded = false;
                this.clickedMesh.position.copy(this.clickedMesh.userData.basePos);
                this.clickedMesh = null;
                if (this.onClickZone) this.onClickZone(null);
            }
        }
    }

    public updateZoneHeat(zoneId: string, density: number) {
        const mesh = this.zones.get(zoneId);
        if (!mesh) return;

        mesh.userData.currentDensity = density;
        
        const clampedDensity = Math.min(Math.max(density, 0), 1.2);
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        const baseC = this.baseColors.get(zoneId)!;
        
        // Heatmap blending: baseColor -> Amber -> Red based on congestion
        const outColor = baseC.clone();

        if (clampedDensity > 0.8) {
            outColor.lerp(new THREE.Color(0xf59e0b), (clampedDensity - 0.8) * 2.5); // Mix with Amber
        }
        if (clampedDensity > 1.0) {
           outColor.lerp(new THREE.Color(0xef4444), (clampedDensity - 1.0) * 5.0); // Hot red
        }

        mat.color.copy(outColor);
        mat.emissive.copy(outColor);
        mat.emissiveIntensity = 0.2 + (clampedDensity * 0.8);
    }

    private onWindowResize() {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    private animate = () => {
        requestAnimationFrame(this.animate);
        this.controls.update();

        // 1. Raycasting
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(Array.from(this.zones.values()));

        let newHovered = null;
        if (intersects.length > 0) {
            newHovered = intersects[0].object as THREE.Mesh;
        }

        if (this.hoveredMesh !== newHovered) {
             // Revert old hovered
             if (this.hoveredMesh) {
                 this.hoveredMesh.scale.set(1, 1, 1);
             }
             this.hoveredMesh = newHovered;
             // Apply new hovered effect
             if (this.hoveredMesh) {
                 this.hoveredMesh.scale.set(1.05, 1.05, 1.05); // slightly expand
             }
        }

        // 2. Animate expansion (Click interactions)
        this.zones.forEach((mesh) => {
            const targetPos = mesh.userData.expanded ? 
                mesh.userData.basePos.clone().add(mesh.userData.expandDir.clone().multiplyScalar(40)) : // Expand outward slightly more
                mesh.userData.basePos; 
            mesh.position.lerp(targetPos, 0.15); 
            
            // Update the persistent overlay labels
            const label = this.labels.get(mesh.userData.id);
            if (label) {
                const vector = mesh.position.clone();
                // Push label outward to the edge of the slice
                vector.add(mesh.userData.expandDir.clone().multiplyScalar(150));
                vector.project(this.camera);

                const x = (0.5 + vector.x / 2) * window.innerWidth;
                const y = (0.5 - vector.y / 2) * window.innerHeight;
                label.style.left = `${x}px`;
                label.style.top = `${y}px`;
                label.style.display = 'block';
            }
        });

        // 3. UI Callback for tooltips
        if (this.hoveredMesh && this.onHoverZone) {
            // Calculate screen coordinates
            const vector = this.hoveredMesh.position.clone();
            if (this.hoveredMesh.userData.expanded) {
                // Approximate center of the arc dynamically slightly outward
                vector.add(this.hoveredMesh.userData.expandDir.clone().multiplyScalar(150));
            } else {
                 vector.add(this.hoveredMesh.userData.expandDir.clone().multiplyScalar(130)); // base radius approx middle
            }
            vector.project(this.camera);

            const container = this.renderer.domElement;
            const x = Math.round((0.5 + vector.x / 2) * container.clientWidth);
            const y = Math.round((0.5 - vector.y / 2) * container.clientHeight);
            
            this.onHoverZone(this.hoveredMesh.userData, { x, y });
        } else if (!this.hoveredMesh && this.onHoverZone) {
            this.onHoverZone(null, null);
        }

        this.renderer.render(this.scene, this.camera);
    }
}
