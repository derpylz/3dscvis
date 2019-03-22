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
    private _discrete: boolean;
    private _legend: BABYLON.GUI.AdvancedDynamicTexture;
    private _showLegend: boolean = true;
    private _SPS: BABYLON.SolidParticleSystem;
    private _size: number = 0.1;
    private _rotationRate: number = 0.01;
    private _selectionCube: BABYLON.Mesh;
    private _selectionGizmo: BABYLON.BoundingBoxGizmo;
    private _showSelectCube: boolean = false;
    private _isTimeSeries: boolean = false;
    private _setTimeSeries: boolean = false;
    private _playingTimeSeries: boolean = false;
    private _timeSeriesIndex: number = 0;
    private _counter: number = 0;
    private _timeSeriesSpeed: number = 1;

    turntable: boolean = false;

    selection: number[];

    /**
     * Initialize the 3d visualization
     * @param canvasElement ID of the canvas element in the dom
     * @param coords Array of arrays containing the 3d coordinates of the cells
     */
    constructor(canvasElement: string, coords: number[][]) {
        this._coords = coords;
        this._canvas = document.getElementById(canvasElement) as HTMLCanvasElement;
        this._engine = new BABYLON.Engine(this._canvas, true);
    }

    /**
     * Create the scene with camera, lights and the solid particle system
     */
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
        this._createCellParticles();

        this._cameraFitCells();

        this._createSelectionCube();

        this._scene.registerBeforeRender(this._prepRender.bind(this));

        this._scene.registerAfterRender(this._afterRender.bind(this));
    }

    /**
     * Register before render
     */
    private _prepRender(): void {
        if (this.turntable) {
            this._camera.alpha += this._rotationRate;
        }
        if (this._isTimeSeries) {
            if (this._playingTimeSeries) {
                if (this._setTimeSeries) {
                    if (this._counter >= this._timeSeriesSpeed) {
                        this._timeSeriesIndex += 1;
                        this._updateTimeSeriesCells();
                        this._counter = 0;
                    } else {
                        this._counter += 1;
                    }
                } else {
                    this._setTimeSeries = true;
                    this._setAllCellsInvisible();
                    this._counter = 0;
                }
            } else {
                if (this._setTimeSeries) {
                    this._setTimeSeries = false;
                }
            }
        } else {
            this._playingTimeSeries = false;
            this._setTimeSeries = false;
        }
    }

    private _afterRender(): void {
        
    }

    /**
     * Positions spheres according to coordinates in a SPS
     */
    private _createCellParticles(): void {
        // prototype cell
        let cell = BABYLON.Mesh.CreateSphere("sphere", 4, this._size, this._scene);
        // particle system
        let SPS = new BABYLON.SolidParticleSystem('SPS', this._scene, {
            updatable: true
        });
        // add all cells to SPS
        SPS.addShape(cell, this._coords.length);

        // position and color cells
        for (let i = 0; i < SPS.nbParticles; i++) {
            SPS.particles[i].position.x = this._coords[i][0];
            SPS.particles[i].position.y = this._coords[i][1];
            SPS.particles[i].position.z = this._coords[i][2];
            if (this._clusters && this._colors) {
                SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._clusters[i]]);
            } else {
                SPS.particles[i].color = new BABYLON.Color4(0.3, 0.3, 0.8, 1);
            }
        }

        SPS.buildMesh();
        // scale bounding box to actual size of the SPS particles
        SPS.computeBoundingBox = true;
        // prepare cells for time series view
        if (this._setTimeSeries) {
            SPS.mesh.hasVertexAlpha = true;
            this._setAllCellsInvisible();
        }
        // remove prototype cell
        cell.dispose();
        // calculate SPS particles
        SPS.setParticles();
        SPS.computeBoundingBox = false;
        this._SPS = SPS;
    }

    /**
     * Make all cells transparent for time series start
     */
    private _setAllCellsInvisible(): void {
        for (let i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
        }
        this._SPS.setParticles();
    }

    private _updateTimeSeriesCells(): void {
        // reset timeSeriesIndex to 0 to loop
        if (this._timeSeriesIndex > Math.max.apply(Math, this._clusters)) {
            this._timeSeriesIndex = 0;
            var indexBefore = Math.max.apply(Math, this._clusters) as number;
            var indexBefore2 = indexBefore - 1;
        } else {
            var indexBefore = this._timeSeriesIndex - 1;
            if (indexBefore < 0) {
                indexBefore = Math.max.apply(Math, this._clusters);
            }
            var indexBefore2 = indexBefore - 1
            if (indexBefore2 < 0) {
                indexBefore2 = Math.max.apply(Math, this._clusters);
            }
        }

        for (var i = 0; i < this._SPS.nbParticles; i++) {
            // cells of current time series index are set visible, all other invisible
            if (this._clusters[i] == this._timeSeriesIndex) {
                this._SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._timeSeriesIndex]);
            } else if (this._clusters[i] == indexBefore) {
                if (this._setTimeSeries) {
                    this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.5);
                } else {
                    this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
                }
            } else if (this._clusters[i] == indexBefore2 && this._setTimeSeries) {
                this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
            }
        }
        this._SPS.setParticles();
    }

    /**
     * Color cells according to this._clusters and this._colors
     */
    private _updateClusterColors(): void {
        for (let i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._clusters[i]]);
        }
        this._SPS.setParticles();
    }

    /**
     * Zoom camera to fit the complete SPS into the field of view
     */
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

    private _createSelectionCube(): void {
        // create cube mesh
        let selCube = BABYLON.MeshBuilder.CreateBox("selectionCube", {
            height: 1,
            width: 1,
            depth: 1,
            updatable: true,
            sideOrientation: BABYLON.Mesh.FRONTSIDE
        }, this._scene);

        // cube itself should be barely visible, the bounding box widget is important
        let mat = new BABYLON.StandardMaterial("selectionMat", this._scene);
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        mat.alpha = 0.1;
        selCube.material = mat;

        // create gizmo
        let utilLayer = new BABYLON.UtilityLayerRenderer(this._scene);
        let gizmo = new BABYLON.BoundingBoxGizmo(new BABYLON.Color3(1, 0, 0), utilLayer);
        gizmo.setEnabledRotationAxis("");
        gizmo.scaleBoxSize = 0.5;
        gizmo.attachedMesh = selCube;

        // Add draggin behaviour
        var boxDragBehavior = new BABYLON.PointerDragBehavior();
        boxDragBehavior.onDragEndObservable.add(() => {
            this._selectCellsInCube();
        });

        selCube.addBehavior(boxDragBehavior);

        // Add scaling behaviour
        gizmo.onScaleBoxDragEndObservable.add(() => {
            this._selectCellsInCube();
        });

        // by default do not show selection Cube
        selCube.visibility = 0;
        gizmo.gizmoLayer.shouldRender = false;
        this._selectionCube = selCube;
        this._selectionGizmo = gizmo;
    }

    private _selectCellsInCube(): void {
        if (this._showSelectCube) {
            var boundInfo = this._selectionCube.getBoundingInfo().boundingBox;
            // array for storing selected cells
            let cellsInside = [];
            for (var i = 0; i < this._SPS.nbParticles; i++) {
                let isInside = this._particleInBox(this._SPS.particles[i].position, boundInfo.minimumWorld, boundInfo.maximumWorld);
                cellsInside.push(isInside);
                // cells inside box are colored red, all others are colored blue
                if (isInside) {
                    this._SPS.particles[i].color = new BABYLON.Color4(1, 0, 0, 1);
                } else {
                    this._SPS.particles[i].color = new BABYLON.Color4(0.3, 0.3, 0.8, 1);
                }
            }
            this._SPS.setParticles();
            this.selection = cellsInside;
        }
    }

    private _particleInBox(position: BABYLON.Vector3, min: BABYLON.Vector3, max: BABYLON.Vector3): boolean {
        // checking against bounding box is sufficient,
        // no rotation is allowed
        if (position.x < min.x || position.x > max.x) {
            return false;
        }
        if (position.y < min.y || position.y > max.y) {
            return false;
        }
        if (position.z < min.z || position.z > max.z) {
            return false;
        }
        return true;
    }

    /**
     * Color cells by discrete clusters
     * @param clusters Array of same length as cells with indices for clusters
     * @param [clusterNames] Array with sorted cluster names
     */
    colorByClusters(clusters: number[], clusterNames?: string[]): void {
        this._clusters = clusters;
        let uniqueClusters = clusters.filter((v, i, a) => a.indexOf(v) === i)
        let nColors = uniqueClusters.length;
        this._colors = chroma.scale(chroma.brewer.Paired).mode('lch').colors(nColors);
        for (let i = 0; i < nColors; i++) {
            this._colors[i] += "ff";
        }
        // check cluster names
        if (clusterNames && clusterNames.length == nColors) {
            this._clusterNames = clusterNames;
        } else {
            // use cluster indices as names if names are not available
            this._clusterNames = uniqueClusters.sort((a, b) => a - b).map(String);
        }
        this._updateClusterColors();
        this._discrete = true;
        if (this._legend) {
            this._legend.dispose();
        }
        if (this._showLegend) {
            this._createLegend();
        }
        if (this._isTimeSeries) {
            this._updateTimeSeriesCells();
        }
    }

    /**
     * Color cells by continuous values
     * @param values Array of same length as cells
     */
    colorByValue(values: number[]): void {
        this._colors = chroma.scale(chroma.brewer.Viridis).mode('lch').colors(100);
        for (let i = 0; i < 100; i++) {
            this._colors[i] += "ff";
        }
        this._clusters = this._evenBins(values);
        this._updateClusterColors();
        this._discrete = false;
        this._clusterNames = [Math.min.apply(Math, values), Math.max.apply(Math, values)]
        if (this._legend) {
            this._legend.dispose();
        }
        if (this._showLegend) {
            this._createLegend();
        }
        if (this._isTimeSeries) {
            this._updateTimeSeriesCells();
        }
    }

    /**
     * Puts values into evenly spaced bins defined by the number of bins.
     * @param vals values to place into bins
     * @param binCount number of bins to create
     */
    private _evenBins(vals: number[], binCount: number = 100): number[] {
        let N = vals.length;
        let binSize = Math.floor(N / binCount);
        let binSizeArr = Array(binCount).fill(binSize);
        let numbered = Array.apply(null, { length: binCount }).map(Number.call, Number);
        binSizeArr = binSizeArr.map((x, idx) => (numbered[idx] <= N % binCount) ? x + 1 : x);
        let binsArr = [];
        for (let i = 0; i < binCount; i++) {
            binsArr.push(new Array(binSizeArr[i]).fill(i));
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

    /**
     * Creates a color legend for the plot
     */
    private _createLegend(): void {
        // create fullscreen GUI texture
        let advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

        // create grid for placing legend in correct position
        let grid = new BABYLON.GUI.Grid();
        advancedTexture.addControl(grid);

        // main position of legend (right middle)
        grid.addColumnDefinition(0.8);
        grid.addColumnDefinition(0.2);
        grid.addRowDefinition(0.25);

        // for continuous measures display viridis color bar and max and min values.
        if (!this._discrete) {
            grid.addRowDefinition(300, true);
            grid.addRowDefinition(0.25);

            let innerGrid = new BABYLON.GUI.Grid();
            innerGrid.addColumnDefinition(0.2);
            innerGrid.addColumnDefinition(0.8);
            innerGrid.addRowDefinition(1);
            grid.addControl(innerGrid, 1, 1);

            // viridis color bar
            let image = new BABYLON.GUI.Image("colorbar", "viridis.png");
            image.height = "300px";
            image.stretch = BABYLON.GUI.Image.STRETCH_UNIFORM;
            innerGrid.addControl(image, 0, 0);

            // label text
            let labelGrid = new BABYLON.GUI.Grid();
            labelGrid.addColumnDefinition(1);
            labelGrid.addRowDefinition(0.05);
            labelGrid.addRowDefinition(0.9);
            labelGrid.addRowDefinition(0.05);
            innerGrid.addControl(labelGrid, 0, 1);

            let minText = new BABYLON.GUI.TextBlock();
            minText.text = this._clusterNames[0].toString();
            minText.color = "black";
            minText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            labelGrid.addControl(minText, 2, 0);

            let maxText = new BABYLON.GUI.TextBlock();
            maxText.text = this._clusterNames[1].toString();
            maxText.color = "black";
            maxText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            labelGrid.addControl(maxText, 0, 0);
        } else {
            // number of clusters
            var n = this._clusterNames.length;
            // adjust height to fit all legend entries
            if (n > 12) {
                grid.addRowDefinition(300, true);
            } else {
                grid.addRowDefinition(25 * n, true);
            }
            grid.addRowDefinition(0.25);

            // inner Grid contains legend rows and columns for color and text
            var innerGrid = new BABYLON.GUI.Grid();
            // two legend columns when more than 15 colors
            if (n > 12) {
                innerGrid.addColumnDefinition(0.1);
                innerGrid.addColumnDefinition(0.4);
                innerGrid.addColumnDefinition(0.1);
                innerGrid.addColumnDefinition(0.4);
            } else {
                innerGrid.addColumnDefinition(0.2);
                innerGrid.addColumnDefinition(0.8);
            }
            for (let i = 0; i < n && i < 13; i++) {
                if (n > 12) {
                    innerGrid.addRowDefinition(1 / 12);
                } else {
                    innerGrid.addRowDefinition(1 / n);
                }
            }
            grid.addControl(innerGrid, 1, 1);

            // add color box and legend text
            for (let i = 0; i < n; i++) {
                // color
                var legendColor = new BABYLON.GUI.Rectangle();
                legendColor.background = this._colors[i];
                legendColor.thickness = 0;
                legendColor.width = "20px";
                legendColor.height = "20px";
                // use second column for many entries
                if (i > 11) {
                    innerGrid.addControl(legendColor, i - 12, 2);
                } else {
                    innerGrid.addControl(legendColor, i, 0);
                }
                // text
                var legendText = new BABYLON.GUI.TextBlock();
                legendText.text = this._clusterNames[i].toString();
                legendText.color = "black";
                legendText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
                // use second column for many entries
                if (i > 11) {
                    innerGrid.addControl(legendText, i - 12, 3);
                } else {
                    innerGrid.addControl(legendText, i, 1);
                }
            }
        }
        this._legend = advancedTexture;
    }

    showLegend(): void {
        if (this._clusters && this._clusterNames) {
            this._showLegend = true;
            this._createLegend;
        }
    }

    hideLegend(): void {
        if (this._legend) {
            this._legend.dispose();
        }
        this._showLegend = false;
    }

    showSelectionCube(): void {
        this._showSelectCube = true;
        this._selectionCube.visibility = 1;
        this._selectionGizmo.gizmoLayer.shouldRender = true;
    }

    hideSelectionCube(): void {
        this._showSelectCube = false;
        this._selectionCube.visibility = 0;
        this._selectionGizmo.gizmoLayer.shouldRender = false;
    }

    enableTimeSeries(): void {
        this._isTimeSeries = true;
    }

    disableTimeSeries(): void {
        this._isTimeSeries = false;
    }

    playTimeSeries(): void {
        this._playingTimeSeries = true;
    }

    pauseTimeSeries(): void {
        this._playingTimeSeries = false;
    }

    setTimeSeriesSpeed(speed: number) {
        this._timeSeriesSpeed = speed;
    }

    setTimeSeriesIndex(index: number) {
        this._timeSeriesIndex = index;
        this._setAllCellsInvisible();
        this._updateTimeSeriesCells();
    }

    /**
     * Start rendering the scene
     */
    doRender(): void {
        this._engine.runRenderLoop(() => {
            this._scene.render();
        });
        window.addEventListener('resize', () => {
            this._engine.resize();
        });
    }
}