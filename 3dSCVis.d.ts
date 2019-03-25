/// <reference path="babylon.d.ts" />
/// <reference path="babylon.gui.d.ts" />
/// <reference path="chroma-js.d.ts" />
/// <reference path="ccapture.d.ts" />
declare class SCVis {
    private _canvas;
    private _engine;
    private _scene;
    private _camera;
    private _hl1;
    private _hl2;
    private _coords;
    private _clusters;
    private _clusterNames;
    private _colors;
    private _discrete;
    private _legend;
    private _showLegend;
    private _SPS;
    private _size;
    private _rotationRate;
    private _selectionCube;
    private _selectionGizmo;
    private _showSelectCube;
    private _isTimeSeries;
    private _setTimeSeries;
    private _playingTimeSeries;
    private _timeSeriesIndex;
    private _counter;
    private _timeSeriesSpeed;
    private _capturer;
    private _prevTimeSeriesSpeed;
    private _wasTurning;
    private _record;
    private _turned;
    turntable: boolean;
    selection: number[];
    /**
     * Initialize the 3d visualization
     * @param canvasElement ID of the canvas element in the dom
     * @param coords Array of arrays containing the 3d coordinates of the cells
     */
    constructor(canvasElement: string, coords: number[][]);
    /**
     * Create the scene with camera, lights and the solid particle system
     */
    createScene(): void;
    /**
     * Register before render
     */
    private _prepRender;
    private _afterRender;
    /**
     * Positions spheres according to coordinates in a SPS
     */
    private _createCellParticles;
    /**
     * Make all cells transparent for time series start
     */
    private _setAllCellsInvisible;
    private _updateTimeSeriesCells;
    /**
     * Color cells according to this._clusters and this._colors
     */
    private _updateClusterColors;
    /**
     * Zoom camera to fit the complete SPS into the field of view
     */
    private _cameraFitCells;
    private _createSelectionCube;
    private _selectCellsInCube;
    private _particleInBox;
    /**
     * Color cells by discrete clusters
     * @param clusters Array of same length as cells with indices for clusters
     * @param [clusterNames] Array with sorted cluster names
     */
    colorByClusters(clusters: number[], clusterNames?: string[]): void;
    /**
     * Color cells by continuous values
     * @param values Array of same length as cells
     */
    colorByValue(values: number[]): void;
    /**
     * Puts values into evenly spaced bins defined by the number of bins.
     * @param vals values to place into bins
     * @param binCount number of bins to create
     */
    private _evenBins;
    /**
     * Creates a color legend for the plot
     */
    private _createLegend;
    showLegend(): void;
    hideLegend(): void;
    showSelectionCube(): void;
    hideSelectionCube(): void;
    enableTimeSeries(): void;
    disableTimeSeries(): void;
    playTimeSeries(): void;
    pauseTimeSeries(): void;
    setTimeSeriesSpeed(speed: number): void;
    setTimeSeriesIndex(index: number): void;
    startRecording(): void;
    /**
     * Start rendering the scene
     */
    doRender(): void;
}
