/// <reference path="babylon.d.ts" />
/// <reference path="babylon.gui.d.ts" />
/// <reference path="chroma-js.d.ts" />
/// <reference path="ccapture.d.ts" />
var SCVis = /** @class */ (function () {
    /**
     * Initialize the 3d visualization
     * @param canvasElement ID of the canvas element in the dom
     * @param coords Array of arrays containing the 3d coordinates of the cells
     */
    function SCVis(canvasElement, coords) {
        this._showLegend = true;
        this._size = 0.1;
        this._rotationRate = 0.01;
        this._showSelectCube = false;
        this._isTimeSeries = false;
        this._setTimeSeries = false;
        this._playingTimeSeries = false;
        this._timeSeriesIndex = 0;
        this._counter = 0;
        this._timeSeriesSpeed = 1;
        this._wasTurning = false;
        this._record = false;
        this._turned = 0;
        this.turntable = false;
        this._coords = coords;
        this._canvas = document.getElementById(canvasElement);
        this._engine = new BABYLON.Engine(this._canvas, true);
    }
    /**
     * Create the scene with camera, lights and the solid particle system
     */
    SCVis.prototype.createScene = function () {
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
    };
    /**
     * Register before render
     */
    SCVis.prototype._prepRender = function () {
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
                    }
                    else {
                        this._counter += 1;
                    }
                }
                else {
                    this._setTimeSeries = true;
                    this._setAllCellsInvisible();
                    this._counter = 0;
                }
            }
            else {
                if (this._setTimeSeries) {
                    this._setTimeSeries = false;
                }
            }
        }
        else {
            this._playingTimeSeries = false;
            this._setTimeSeries = false;
        }
    };
    SCVis.prototype._afterRender = function () {
        if (this._record) {
            if (this._turned == 0) {
                // remove shading by setting all lights to 1 intensity
                // this reduces the colorbanding issue of gif saving
                this._hl2.diffuse = new BABYLON.Color3(1, 1, 1);
                // create capturer, enable turning
                if (this._discrete) {
                    var worker = './';
                }
                else {
                    var worker = './ditherWorker/';
                }
                this._capturer = new CCapture({
                    format: 'gif',
                    framerate: 30,
                    workersPath: worker,
                    verbose: false,
                    display: true,
                    quality: 50,
                    workers: 8
                });
                this._capturer.start();
                this._rotationRate = 0.02;
                if (this._playingTimeSeries) {
                    this._setAllCellsInvisible();
                    this._timeSeriesIndex = 0;
                    this._counter = 0;
                    this._updateTimeSeriesCells();
                    var nSteps = Math.max.apply(Math, this._clusters) + 1;
                    this._prevTimeSeriesSpeed = this._timeSeriesSpeed;
                    this._timeSeriesSpeed = Math.floor((2 * Math.PI / this._rotationRate / nSteps) - 1);
                }
                // to return turntable option to its initial state after recording
                if (this.turntable) {
                    this._wasTurning = true;
                }
                else {
                    this.turntable = true;
                }
            }
            if (this._turned < 2 * Math.PI) {
                // while recording, count rotation and capture screenshots
                this._turned += this._rotationRate;
                this._capturer.capture(this._canvas);
            }
            else {
                // after capturing 360°, stop capturing and save gif
                this._record = false;
                this._capturer.stop();
                this._capturer.save();
                this._turned = 0;
                this._rotationRate = 0.01;
                this._hl2.diffuse = new BABYLON.Color3(0.8, 0.8, 0.8);
                if (!this._wasTurning) {
                    this.turntable = false;
                }
                if (this._playingTimeSeries) {
                    this._timeSeriesSpeed = this._prevTimeSeriesSpeed;
                }
            }
        }
    };
    /**
     * Positions spheres according to coordinates in a SPS
     */
    SCVis.prototype._createCellParticles = function () {
        // prototype cell
        var cell = BABYLON.Mesh.CreateSphere("sphere", 4, this._size, this._scene);
        // particle system
        var SPS = new BABYLON.SolidParticleSystem('SPS', this._scene, {
            updatable: true
        });
        // add all cells to SPS
        SPS.addShape(cell, this._coords.length);
        // position and color cells
        for (var i = 0; i < SPS.nbParticles; i++) {
            SPS.particles[i].position.x = this._coords[i][0];
            SPS.particles[i].position.y = this._coords[i][1];
            SPS.particles[i].position.z = this._coords[i][2];
            if (this._clusters && this._colors) {
                SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._clusters[i]]);
            }
            else {
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
    };
    /**
     * Make all cells transparent for time series start
     */
    SCVis.prototype._setAllCellsInvisible = function () {
        for (var i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
        }
        this._SPS.setParticles();
    };
    SCVis.prototype._updateTimeSeriesCells = function () {
        // reset timeSeriesIndex to 0 to loop
        if (this._timeSeriesIndex > Math.max.apply(Math, this._clusters)) {
            this._timeSeriesIndex = 0;
            var indexBefore = Math.max.apply(Math, this._clusters);
            var indexBefore2 = indexBefore - 1;
        }
        else {
            var indexBefore = this._timeSeriesIndex - 1;
            if (indexBefore < 0) {
                indexBefore = Math.max.apply(Math, this._clusters);
            }
            var indexBefore2 = indexBefore - 1;
            if (indexBefore2 < 0) {
                indexBefore2 = Math.max.apply(Math, this._clusters);
            }
        }
        for (var i = 0; i < this._SPS.nbParticles; i++) {
            // cells of current time series index are set visible, all other invisible
            if (this._clusters[i] == this._timeSeriesIndex) {
                this._SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._timeSeriesIndex]);
            }
            else if (this._clusters[i] == indexBefore) {
                if (this._setTimeSeries) {
                    this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.5);
                }
                else {
                    this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
                }
            }
            else if (this._clusters[i] == indexBefore2 && this._setTimeSeries) {
                this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
            }
        }
        this._SPS.setParticles();
    };
    /**
     * Color cells according to this._clusters and this._colors
     */
    SCVis.prototype._updateClusterColors = function () {
        for (var i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._clusters[i]]);
        }
        this._SPS.setParticles();
    };
    /**
     * Zoom camera to fit the complete SPS into the field of view
     */
    SCVis.prototype._cameraFitCells = function () {
        var radius = this._SPS.mesh.getBoundingInfo().boundingSphere.radiusWorld;
        var aspectRatio = this._engine.getAspectRatio(this._camera);
        var halfMinFov = this._camera.fov / 2;
        if (aspectRatio < 1) {
            halfMinFov = Math.atan(aspectRatio * Math.tan(this._camera.fov / 2));
        }
        var viewRadius = Math.abs(radius / Math.sin(halfMinFov));
        this._camera.radius = viewRadius;
    };
    SCVis.prototype._createSelectionCube = function () {
        var _this = this;
        // create cube mesh
        var selCube = BABYLON.MeshBuilder.CreateBox("selectionCube", {
            height: 1,
            width: 1,
            depth: 1,
            updatable: true,
            sideOrientation: BABYLON.Mesh.FRONTSIDE
        }, this._scene);
        // cube itself should be barely visible, the bounding box widget is important
        var mat = new BABYLON.StandardMaterial("selectionMat", this._scene);
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        mat.alpha = 0.1;
        selCube.material = mat;
        // create gizmo
        var utilLayer = new BABYLON.UtilityLayerRenderer(this._scene);
        var gizmo = new BABYLON.BoundingBoxGizmo(new BABYLON.Color3(1, 0, 0), utilLayer);
        gizmo.setEnabledRotationAxis("");
        gizmo.scaleBoxSize = 0.5;
        gizmo.attachedMesh = selCube;
        // Add draggin behaviour
        var boxDragBehavior = new BABYLON.PointerDragBehavior();
        boxDragBehavior.onDragEndObservable.add(function () {
            _this._selectCellsInCube();
        });
        selCube.addBehavior(boxDragBehavior);
        // Add scaling behaviour
        gizmo.onScaleBoxDragEndObservable.add(function () {
            _this._selectCellsInCube();
        });
        // by default do not show selection Cube
        selCube.visibility = 0;
        gizmo.gizmoLayer.shouldRender = false;
        this._selectionCube = selCube;
        this._selectionGizmo = gizmo;
    };
    SCVis.prototype._selectCellsInCube = function () {
        if (this._showSelectCube) {
            var boundInfo = this._selectionCube.getBoundingInfo().boundingBox;
            // array for storing selected cells
            var cellsInside = [];
            for (var i = 0; i < this._SPS.nbParticles; i++) {
                var isInside = this._particleInBox(this._SPS.particles[i].position, boundInfo.minimumWorld, boundInfo.maximumWorld);
                cellsInside.push(isInside);
                // cells inside box are colored red, all others are colored blue
                if (isInside) {
                    this._SPS.particles[i].color = new BABYLON.Color4(1, 0, 0, 1);
                }
                else {
                    this._SPS.particles[i].color = new BABYLON.Color4(0.3, 0.3, 0.8, 1);
                }
            }
            this._SPS.setParticles();
            this.selection = cellsInside;
        }
    };
    SCVis.prototype._particleInBox = function (position, min, max) {
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
    };
    /**
     * Color cells by discrete clusters
     * @param clusters Array of same length as cells with indices for clusters
     * @param [clusterNames] Array with sorted cluster names
     */
    SCVis.prototype.colorByClusters = function (clusters, clusterNames) {
        this._clusters = clusters;
        var uniqueClusters = clusters.filter(function (v, i, a) { return a.indexOf(v) === i; });
        var nColors = uniqueClusters.length;
        this._colors = chroma.scale(chroma.brewer.Paired).mode('lch').colors(nColors);
        for (var i = 0; i < nColors; i++) {
            this._colors[i] += "ff";
        }
        // check cluster names
        if (clusterNames && clusterNames.length == nColors) {
            this._clusterNames = clusterNames;
        }
        else {
            // use cluster indices as names if names are not available
            this._clusterNames = uniqueClusters.sort(function (a, b) { return a - b; }).map(String);
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
    };
    /**
     * Color cells by continuous values
     * @param values Array of same length as cells
     */
    SCVis.prototype.colorByValue = function (values) {
        this._colors = chroma.scale(chroma.brewer.Viridis).mode('lch').colors(100);
        for (var i = 0; i < 100; i++) {
            this._colors[i] += "ff";
        }
        this._clusters = this._evenBins(values);
        this._updateClusterColors();
        this._discrete = false;
        this._clusterNames = [Math.min.apply(Math, values), Math.max.apply(Math, values)];
        if (this._legend) {
            this._legend.dispose();
        }
        if (this._showLegend) {
            this._createLegend();
        }
        if (this._isTimeSeries) {
            this._updateTimeSeriesCells();
        }
    };
    /**
     * Puts values into evenly spaced bins defined by the number of bins.
     * @param vals values to place into bins
     * @param binCount number of bins to create
     */
    SCVis.prototype._evenBins = function (vals, binCount) {
        if (binCount === void 0) { binCount = 100; }
        var N = vals.length;
        var binSize = Math.floor(N / binCount);
        var binSizeArr = Array(binCount).fill(binSize);
        var numbered = Array.apply(null, { length: binCount }).map(Number.call, Number);
        binSizeArr = binSizeArr.map(function (x, idx) { return (numbered[idx] <= N % binCount) ? x + 1 : x; });
        var binsArr = [];
        for (var i = 0; i < binCount; i++) {
            binsArr.push(new Array(binSizeArr[i]).fill(i));
        }
        var bins = binsArr.flat();
        var sorted = vals.slice().sort(function (a, b) { return a - b; });
        var ranks = vals.slice().map(function (v) { return sorted.indexOf(v); });
        var binned = [];
        for (var i = 0; i < N; i++) {
            binned.push(bins[ranks[i]]);
        }
        return binned;
    };
    /**
     * Creates a color legend for the plot
     */
    SCVis.prototype._createLegend = function () {
        // create fullscreen GUI texture
        var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        // create grid for placing legend in correct position
        var grid = new BABYLON.GUI.Grid();
        advancedTexture.addControl(grid);
        // main position of legend (right middle)
        grid.addColumnDefinition(0.8);
        grid.addColumnDefinition(0.2);
        grid.addRowDefinition(0.25);
        // for continuous measures display viridis color bar and max and min values.
        if (!this._discrete) {
            grid.addRowDefinition(300, true);
            grid.addRowDefinition(0.25);
            var innerGrid_1 = new BABYLON.GUI.Grid();
            innerGrid_1.addColumnDefinition(0.2);
            innerGrid_1.addColumnDefinition(0.8);
            innerGrid_1.addRowDefinition(1);
            grid.addControl(innerGrid_1, 1, 1);
            // viridis color bar
            var image = new BABYLON.GUI.Image("colorbar", "viridis.png");
            image.height = "300px";
            image.stretch = BABYLON.GUI.Image.STRETCH_UNIFORM;
            innerGrid_1.addControl(image, 0, 0);
            // label text
            var labelGrid = new BABYLON.GUI.Grid();
            labelGrid.addColumnDefinition(1);
            labelGrid.addRowDefinition(0.05);
            labelGrid.addRowDefinition(0.9);
            labelGrid.addRowDefinition(0.05);
            innerGrid_1.addControl(labelGrid, 0, 1);
            var minText = new BABYLON.GUI.TextBlock();
            minText.text = parseFloat(this._clusterNames[0]).toFixed(4).toString();
            minText.color = "black";
            minText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            labelGrid.addControl(minText, 2, 0);
            var maxText = new BABYLON.GUI.TextBlock();
            maxText.text = parseFloat(this._clusterNames[1]).toFixed(4).toString();
            maxText.color = "black";
            maxText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            labelGrid.addControl(maxText, 0, 0);
        }
        else {
            // number of clusters
            var n = this._clusterNames.length;
            // adjust height to fit all legend entries
            if (n > 12) {
                grid.addRowDefinition(300, true);
            }
            else {
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
            }
            else {
                innerGrid.addColumnDefinition(0.2);
                innerGrid.addColumnDefinition(0.8);
            }
            for (var i = 0; i < n && i < 13; i++) {
                if (n > 12) {
                    innerGrid.addRowDefinition(1 / 12);
                }
                else {
                    innerGrid.addRowDefinition(1 / n);
                }
            }
            grid.addControl(innerGrid, 1, 1);
            // add color box and legend text
            for (var i = 0; i < n; i++) {
                // color
                var legendColor = new BABYLON.GUI.Rectangle();
                legendColor.background = this._colors[i];
                legendColor.thickness = 0;
                legendColor.width = "20px";
                legendColor.height = "20px";
                // use second column for many entries
                if (i > 11) {
                    innerGrid.addControl(legendColor, i - 12, 2);
                }
                else {
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
                }
                else {
                    innerGrid.addControl(legendText, i, 1);
                }
            }
        }
        this._legend = advancedTexture;
    };
    SCVis.prototype.showLegend = function () {
        if (this._clusters && this._clusterNames) {
            this._showLegend = true;
            this._createLegend;
        }
    };
    SCVis.prototype.hideLegend = function () {
        if (this._legend) {
            this._legend.dispose();
        }
        this._showLegend = false;
    };
    SCVis.prototype.showSelectionCube = function () {
        this._showSelectCube = true;
        this._selectionCube.visibility = 1;
        this._selectionGizmo.gizmoLayer.shouldRender = true;
    };
    SCVis.prototype.hideSelectionCube = function () {
        this._showSelectCube = false;
        this._selectionCube.visibility = 0;
        this._selectionGizmo.gizmoLayer.shouldRender = false;
    };
    SCVis.prototype.enableTimeSeries = function () {
        this._isTimeSeries = true;
    };
    SCVis.prototype.disableTimeSeries = function () {
        this._isTimeSeries = false;
    };
    SCVis.prototype.playTimeSeries = function () {
        this._playingTimeSeries = true;
    };
    SCVis.prototype.pauseTimeSeries = function () {
        this._playingTimeSeries = false;
    };
    SCVis.prototype.setTimeSeriesSpeed = function (speed) {
        this._timeSeriesSpeed = speed;
    };
    SCVis.prototype.setTimeSeriesIndex = function (index) {
        this._timeSeriesIndex = index;
        this._setAllCellsInvisible();
        this._updateTimeSeriesCells();
    };
    SCVis.prototype.startRecording = function () {
        this._record = true;
    };
    /**
     * Start rendering the scene
     */
    SCVis.prototype.doRender = function () {
        var _this = this;
        this._engine.runRenderLoop(function () {
            _this._scene.render();
        });
        window.addEventListener('resize', function () {
            _this._engine.resize();
        });
    };
    return SCVis;
}());
