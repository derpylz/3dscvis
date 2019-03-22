/// <reference path="babylon.d.ts" />
/// <reference path="babylon.gui.d.ts" />
/// <reference path="chroma-js.d.ts" />
var SCVis = /** @class */ (function () {
    function SCVis(canvasElement, coords) {
        this._size = 0.1;
        this._setTimeSeries = false;
        this._turntable = false;
        this._rotationRate = 0.1;
        this._coords = coords;
        this._canvas = document.getElementById(canvasElement);
        this._engine = new BABYLON.Engine(this._canvas, true);
    }
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
        this._SPS = this._createCellParticles();
        this._cameraFitCells();
        this._scene.registerBeforeRender(this._prepRender);
    };
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
        // prepare cells for time series view
        if (this._setTimeSeries) {
            SPS.mesh.hasVertexAlpha = true;
            this._setAllCellsInvisible();
        }
        // remove prototype cell
        cell.dispose();
        // calculate SPS particles
        SPS.setParticles();
        return SPS;
    };
    // private _positionCells(particle: BABYLON.SolidParticle, _i: number, s: number): void {
    //     particle.position.x = this._coords[s][0];
    //     particle.position.y = this._coords[s][1];
    //     particle.position.z = this._coords[s][2];
    //     // if the color is not defined by a variable, all cells are colored blue
    //     if (this._clusters) {
    //         particle.color = BABYLON.Color4.FromHexString(this._colors[this._clusters[s]]);
    //     } else {
    //         particle.color = new BABYLON.Color4(0.3, 0.3, 0.8, 1);
    //     }
    // }
    SCVis.prototype._setAllCellsInvisible = function () {
        for (var i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
        }
        this._SPS.setParticles();
    };
    SCVis.prototype._updateClusterColors = function () {
        for (var i = 0; i < this._SPS.nbParticles; i++) {
            this._SPS.particles[i].color = BABYLON.Color4.FromHexString(this._colors[this._clusters[i]]);
        }
        this._SPS.setParticles();
    };
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
    SCVis.prototype._prepRender = function () {
        if (this._turntable) {
            this._camera.alpha += this._rotationRate;
        }
    };
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
    };
    SCVis.prototype.colorByValue = function (values) {
        this._colors = chroma.scale(chroma.brewer.Viridis).mode('lch').colors(100);
        for (var i = 0; i < 100; i++) {
            this._colors[i] += "ff";
        }
        this._clusters = this._evenBins(values);
        this._updateClusterColors();
    };
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
