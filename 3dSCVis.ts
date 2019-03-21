/// <reference path="babylon.d.ts" />
/// <reference path="babylon.gui.d.ts" />
/// <reference path="chroma-js.d.ts" />

class SCVis {
    private _canvas: HTMLCanvasElement;
    private _engine: BABYLON.Engine;
    private _scene: BABYLON.Scene;
    private _camera: BABYLON.ArcRotateCamera;
    private _hl1: BABYLON.HemisphericLight;
    private _hl2: BABYLON.HemisphericLight;
    private _coords: number[][];
    private _clusters: number[];
    private _clusterNames: string[];
    private _colors: string[];
    private _legend: BABYLON.GUI.AdvancedDynamicTexture;
    private _SPS: BABYLON.SolidParticleSystem;
    private _size: number = 0.1;
    private _setTimeSeries: boolean = false;
    private _turntable: boolean = false;
    private _rotationRate: number = 0.1;

    constructor(canvasElement: string, coords: number[][]) {
        this._coords = coords;
        this._canvas = document.getElementById(canvasElement) as HTMLCanvasElement;
        this._engine = new BABYLON.Engine(this._canvas, true);
    }

    createScene(): void {
        this._scene = new BABYLON.Scene(this._engine);

        // camera
        this._camera = new BABYLON.ArcRotateCamera("Camera", 0, 0, 10, BABYLON.Vector3.Zero(), this._scene);
        this._camera.attachControl(this._canvas, true);
        this._camera.wheelPrecision = 50;

        // background color
        this._scene.clearColor = new BABYLON.Color4(1, 1, 1, 1);

        // two lights to illuminate the cells uniformly (top and bottom)
        this._hl1 = new BABYLON.HemisphericLight("HemiLight", new BABYLON.Vector3(0, 1, 0), this._scene);
        this._hl1.diffuse = new BABYLON.Color3(1, 1, 1);
        this._hl1.specular = new BABYLON.Color3(0, 0, 0);
        // bottom light slightly weaker for better depth perception and orientation
        this._hl2 = new BABYLON.HemisphericLight("HemiLight", new BABYLON.Vector3(0, -1, 0), this._scene);
        this._hl2.diffuse = new BABYLON.Color3(0.8, 0.8, 0.8);
        this._hl2.specular = new BABYLON.Color3(0, 0, 0);

        // Solid particle system with cell embedding
        this._SPS = this._createCellParticles();

        this._cameraFitCells();

        this._scene.registerBeforeRender(this._prepRender);
    }

    
    private _createCellParticles(): BABYLON.SolidParticleSystem {
        // prototype cell
        let cell = BABYLON.Mesh.CreateSphere("sphere", 4, this._size, this._scene);
        // particle system
        let SPS = new BABYLON.SolidParticleSystem('SPS', this._scene, {
            updatable: true
        });
        // add all cells with position function
        SPS.addShape(cell, this._coords.length, {
            positionFunction: this._positionCells
        });

        SPS.buildMesh();
        // prepare cells for time series view
        if (this._setTimeSeries) {
            SPS.mesh.hasVertexAlpha = true;
            this._setAllCellsInvisible();
        }
        // remove prototype cell
        cell.dispose();
        // calculate SPS particles
        SPS.setParticles();
        return SPS
    }

    private _positionCells(particle: BABYLON.SolidParticle, _i: number, s: number): void {
        particle.position.x = this._coords[s][0];
        particle.position.y = this._coords[s][1];
        particle.position.z = this._coords[s][2];
        // if the color is not defined by a variable, all cells are colored blue
        if (this._clusters) {
            particle.color = BABYLON.Color4.FromHexString(this._colors[this._clusters[s]]);
        } else {
            particle.color = new BABYLON.Color4(0.3, 0.3, 0.8, 1);
        }
    }
    
    private _setAllCellsInvisible(): void {
        for (let i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
        }
        this._SPS.setParticles();
    }

    private _updateClusterColors(): void {
        for (let i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._clusters[i]]);
        }
        this._SPS.setParticles();
    }
    
    private _cameraFitCells(): void {
        let radius = this._SPS.mesh.getBoundingInfo().boundingSphere.radiusWorld;
        let aspectRatio = this._engine.getAspectRatio(this._camera);
        let halfMinFov = this._camera.fov / 2;
        if (aspectRatio < 1) {
            halfMinFov = Math.atan(aspectRatio * Math.tan(this._camera.fov / 2));
        }
        let viewRadius = Math.abs(radius / Math.sin(halfMinFov));
        this._camera.radius = viewRadius;
    }

    private _prepRender(): void {
        if (this._turntable) {
            this._camera.alpha += this._rotationRate;
        }
    }

    colorByClusters(clusters: number[], clusterNames?: string[]): void {
        this._clusters = clusters;
        let uniqueClusters = clusters.filter((v, i, a) => a.indexOf(v) === i)
        let nColors = uniqueClusters.length;
        this._colors = chroma.scale(chroma.brewer.Paired).mode('lch').colors(nColors);
        // check cluster names
        if (clusterNames && clusterNames.length == nColors) {
            this._clusterNames = clusterNames;
        } else {
            // use cluster indices as names if names are not available
            this._clusterNames = uniqueClusters.sort((a, b) => a - b).map(String);
        }
        this._updateClusterColors();
    }

    colorByValue(values: number[]): void {
        this._colors = chroma.scale(chroma.brewer.Viridis).mode('lch').colors(100);
        this._clusters = this._evenBins(values);
        this._updateClusterColors();
    }

    private _evenBins(vals: number[], binCount: number = 100): number[] {
        let N = vals.length;
        let binSize = Math.floor(N / binCount);
        let binSizeArr = Array(binCount).fill(binSize);
        let numbered = Array.apply(null, {length: binCount}).map(Number.call, Number);
        binSizeArr = binSizeArr.map((x, idx) => (numbered[idx] <= N) ? x + 1 : x);
        let binsArr = [];
        for (let i = 0; i < binCount; i++) {
            binsArr.push(new Array(binSizeArr[i] - 1).fill(i));
        }
        let bins = binsArr.flat();
        let sorted = vals.slice().sort((a, b) => a - b);
        let ranks = vals.slice().map(v => sorted.indexOf(v));
        let binned = [];
        for (let i = 0; i < N; i++) {
            binned.push(bins[ranks[i]]);
        }
        return binned;
    }
    
    doRender(): void {
        this._engine.runRenderLoop(() => {
            this._scene.render();
        });
        window.addEventListener('resize', () => {
            this._engine.resize();
        });
    }
}