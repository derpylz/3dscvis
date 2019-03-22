/// <reference path="babylon.d.ts" />
/// <reference path="babylon.gui.d.ts" />
/// <reference path="chroma-js.d.ts" />
var SCVis = /** @class */ (function () {
    /**
     * Initialize the 3d visualization
     * @param canvasElement ID of the canvas element in the dom
     * @param coords Array of arrays containing the 3d coordinates of the cells
     */
    function SCVis(canvasElement, coords) {
        this._size = 0.1;
        this._setTimeSeries = false;
        this._rotationRate = 0.01;
        this.turntable = false;
        this.showLegend = true;
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
        this._scene.registerBeforeRender(this._prepRender.bind(this));
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
    /**
     * Register before render
     */
    SCVis.prototype._prepRender = function () {
        if (this.turntable) {
            this._camera.alpha += this._rotationRate;
        }
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
        if (this.showLegend) {
            this._createLegend();
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
        if (this.showLegend) {
            this._createLegend();
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
            minText.text = this._clusterNames[0].toString();
            minText.color = "black";
            minText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            labelGrid.addControl(minText, 2, 0);
            var maxText = new BABYLON.GUI.TextBlock();
            maxText.text = this._clusterNames[1].toString();
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
