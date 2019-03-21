// ------------------------------------------------------------------------------------------------
// Parameters

var turned = 0; // stores rotation progress for recording gif, in radians
var rotationRate = 0.01 // speed of rotation
var capturer; // ccapture object
var wasTurning; // if turntable was active before recording
var counter = 0;
var setTimeSeries = false;
var prevTimeSeriesSpeed;
var isSequential = false;

var coords; // 3d coordinates of cells
var hasRun = false; // if hasRun, the canvas and engine do not need to be initialized again
var canvas;
var engine;
var scene;
var renderLoop;
var clusters; // indices for colors
var colors; // array of all unique colors to use
var turntable = false; // rotating the camera
var colored = false; // use default blue color or color information from clusters
var showSelectCube = false;
var size = 0.1; // size of cells
var dataChanged = false; // changed to true if SPS needs to be updated
var record = false; // recording gif
var legendInfo;
var isTimeSeries = false;
var playingTimeSeries = false;
var timeSeriesSpeed = 1;
var timeSeriesIndex = 0;

// ------------------------------------------------------------------------------------------------
// 3d Visualization

/**
 * Babylonjs scene for displaying the 3d data on the canvas
 */
var createScene = function (engine, coords) {
  var scene = new BABYLON.Scene(engine);

  // camera
  var camera = new BABYLON.ArcRotateCamera("Camera", 0, 0, 10, BABYLON.Vector3.Zero(), scene);
  camera.setPosition(new BABYLON.Vector3(-10, 10, 0));
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 50;

  // background color
  scene.clearColor = new BABYLON.Color3(1, 1, 1);

  // light
  var lightArray = createLights(scene);

  // Cell embedding
  var SPS = createCellParticles(scene, coords);

  // Cube for cell selection
  var selectionCubeArray = createSelectionCube(scene, SPS);

  // place camera to fit cells completely inside field of view
  cameraFitCells(SPS, camera);

  var legend;

  // turning and color changing
  scene.registerBeforeRender(function () {
    if (turntable) {
      camera.alpha += rotationRate;
    }
    if (isTimeSeries) {
      if (playingTimeSeries) {
        if (setTimeSeries) {
          if (counter >= timeSeriesSpeed) {
            timeSeriesIndex += 1;
            updateTimeSeriesCells(SPS);
            lastTime = new Date();
            counter = 0;
          } else {
            counter += 1;
          }
        } else {
          setTimeSeries = true;
          SPS = resetSPS(SPS, scene);
          selectionCubeArray = resetSelectionCube(selectionCubeArray, scene, SPS);
          lastTime = new Date();
          counter = 0;
        }
      } else {
        if (setTimeSeries) {
          setTimeSeries = false;
        } else {
          setAllCellsInvisible(SPS);
        }
        if (dataChanged) {
          updateTimeSeriesCells(SPS);
          dataChanged = false;
        }
      }
    } else {
      playingTimeSeries = false;
      setTimeSeries = false;
    }
    if (showSelectCube) {
      selectionCubeArray[0].visibility = 1;
      selectionCubeArray[1].gizmoLayer.shouldRender = true;
    } else {
      selectionCubeArray[0].visibility = 0;
      selectionCubeArray[1].gizmoLayer.shouldRender = false;
    }
    if (dataChanged) {
      // on changed data, reload complete scene
      SPS = resetSPS(SPS, scene);
      selectionCubeArray = resetSelectionCube(selectionCubeArray, scene, SPS);
      dataChanged = false;
      // if applicable, add a legend to the scene
      if (legendInfo) {
        if (legend) {
          legend.dispose();
        }
        legend = createLegend(legendInfo);
      } else {
        // remove legend from scene, if no longer needed
        if (legend) {
          legend.dispose();
        }
      }
    }
  });

  scene.registerAfterRender(function () {
    // record gif of animation
    if (record) {
      if (turned == 0) {
        // remove shading by setting all lights to 1 intensity
        // this reduces the colorbanding issue of gif saving
        lightArray[1].diffuse = new BABYLON.Color3(1, 1, 1);
        // create capturer, enable turning
        if (isSequential) {
          var worker = '/ditherWorker/';
        } else {
          var worker = '/'
        }
        capturer = new CCapture({
          format: 'gif',
          framerate: 30,
          workersPath: worker,
          verbose: false,
          display: true,
          quality: 50,
          workers: 8
        });
        capturer.start();
        rotationRate = 0.02;
        if (playingTimeSeries) {
          setAllCellsInvisible(SPS);
          timeSeriesIndex = 0;
          counter = 0;
          updateTimeSeriesCells(SPS);
          let nSteps = Math.max.apply(Math, clusters) + 1;
          prevTimeSeriesSpeed = timeSeriesSpeed;
          timeSeriesSpeed = Math.floor((2 * Math.PI / rotationRate / nSteps) - 1);
        }
        // to return turntable option to its initial state after recording
        if (turntable) {
          wasTurning = true;
        } else {
          turntable = true;
        }
      }
      if (turned < 2 * Math.PI) {
        // while recording, count rotation and capture screenshots
        turned += rotationRate;
        capturer.capture(canvas);
      } else {
        // after capturing 360°, stop capturing and save gif
        record = false;
        capturer.stop();
        capturer.save();
        turned = 0;
        rotationRate = 0.01;
        lightArray[1].diffuse = new BABYLON.Color3(0.8, 0.8, 0.8);
        if (!wasTurning) {
          turntable = false;
        }
        if (playingTimeSeries) {
          timeSeriesSpeed = prevTimeSeriesSpeed;
        }
      }
    }
  });

  return scene;
};

/**
 * Dispose of existing and create new Selection Cube
 * @param {Array} selectionCubeArray 
 * @param {BABYLON.Scene} scene 
 * @param {BABYLON.SolidParticleSystem} SPS 
 */
function resetSelectionCube(selectionCubeArray, scene, SPS) {
  selectionCubeArray[0].dispose();
  selectionCubeArray[1].dispose();
  selectionCubeArray = createSelectionCube(scene, SPS);
  return selectionCubeArray;
}

/**
 * Dispose of existing and create new SPS
 * @param {BABYLON.SolidParticleSystem} SPS 
 * @param {BABYLON.Scene} scene 
 */
function resetSPS(SPS, scene) {
  SPS.dispose();
  SPS = createCellParticles(scene);
  return SPS;
}

/**
 * Place camera to fit the SPS mesh inside FOV
 * @param {BABYLON.SolidParticleSystem} SPS 
 * @param {BABYLON.ArcRotateCamera} camera 
 */
function cameraFitCells(SPS, camera) {
  var radius = SPS.mesh.getBoundingInfo().boundingSphere.radiusWorld;
  var aspectRatio = engine.getAspectRatio(camera);
  var halfMinFov = camera.fov / 2;
  if (aspectRatio < 1) {
    halfMinFov = Math.atan(aspectRatio * Math.tan(camera.fov / 2));
  }
  var viewRadius = Math.abs(radius / Math.sin(halfMinFov));
  camera.radius = viewRadius;
}

/**
 * Add lights to scene
 * @param {BABYLON.Scene} scene 
 */
function createLights(scene) {
  // two lights to illuminate the cells uniformly (top and bottom)
  var hl1 = new BABYLON.HemisphericLight("HemiLight", new BABYLON.Vector3(0, 1, 0), scene);
  hl1.diffuse = new BABYLON.Color3(1, 1, 1);
  hl1.specular = new BABYLON.Color3(0, 0, 0);
  // bottom light slightly weaker for better depth perception and orientation
  var hl2 = new BABYLON.HemisphericLight("HemiLight", new BABYLON.Vector3(0, -1, 0), scene);
  hl2.diffuse = new BABYLON.Color3(0.8, 0.8, 0.8);
  hl2.specular = new BABYLON.Color3(0, 0, 0);
  return [hl1, hl2]
}

/**
 * Create a solid particle system for the cells
 * @param {BABYLON.Scene} Scene
 */
function createCellParticles(scene, coords) {
  // prototype cell
  var cell = BABYLON.Mesh.CreateSphere("sphere", 4, size, scene);
  // particle system
  var SPS = new BABYLON.SolidParticleSystem('SPS', scene, {
    updatable: true
  });
  // add all cells with position function
  SPS.addShape(cell, coords.length, {
    positionFunction: positionCells
  });

  var mesh = SPS.buildMesh();

  if (setTimeSeries) {
    SPS.mesh.hasVertexAlpha = true;
    setAllCellsInvisible(SPS);
  }
  // remove prototype cell
  cell.dispose();
  SPS.setParticles();
  return SPS;
}

function setAllCellsInvisible(SPS) {
  for (var i = 0; i < SPS.nbParticles; i++) {
    SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
  }
}

function updateTimeSeriesCells(SPS) {
  // reset timeSeriesIndex to 0 to loop
  if (timeSeriesIndex > Math.max.apply(Math, clusters)) {
    timeSeriesIndex = 0;
    var indexBefore = Math.max.apply(Math, clusters);
    var indexBefore2 = indexBefore - 1;
  } else {
    var indexBefore = timeSeriesIndex - 1;
    if (indexBefore < 0) {
      indexBefore = Math.max.apply(Math, clusters);
    }
    var indexBefore2 = indexBefore - 1
    if (indexBefore2 < 0) {
      indexBefore2 = Math.max.apply(Math, clusters);
    }
  }

  for (var i = 0; i < SPS.nbParticles; i++) {
    // cells of current time series index are set visible, all other invisible
    if (clusters[i] == timeSeriesIndex) {
      SPS.particles[i].color = new BABYLON.Color4.FromHexString(colors[timeSeriesIndex]);
    } else if (clusters[i] == indexBefore) {
      if (setTimeSeries) {
        SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.5);
      } else {
        SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
      }
    } else if (clusters[i] == indexBefore2 && setTimeSeries) {
      SPS.particles[i].color = new BABYLON.Color4(1, 1, 1, 0.3);
    }
  }
  SPS.setParticles();
}

/**
 * Position and color cells according to their umap coordinates
 * @param {Object} particle the current cell to be positioned
 * @param {Number} i its global index in the SPS
 * @param {Number} s its index in its shape
 */
function positionCells(particle, _i, s) {
  particle.position.x = coords[s][0];
  particle.position.y = coords[s][1];
  particle.position.z = coords[s][2];
  // if the color is not defined by a variable, all cells are colored blue
  if (colored) {
    particle.color = new BABYLON.Color4.FromHexString(colors[clusters[s]]);
  } else {
    particle.color = new BABYLON.Color3(0.3, 0.3, 0.8);
  }
}

/**
 * Add selection cube to scene and add behaviour
 * @param {BABYLON.Scene} scene Scene
 * @param {BABYLON.SolidParticleSystem} SPS 
 */
function createSelectionCube(scene, SPS) {
  // create cube mesh
  var selectionCube = new BABYLON.MeshBuilder.CreateBox("selectionBox", {
    height: 1,
    width: 1,
    depth: 1,
    updatable: true,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, scene);
  // cube itself should be barely visible, the bounding box widget is important
  mat = new BABYLON.StandardMaterial("selectionMat", scene);
  mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  mat.alpha = 0.1;
  selectionCube.material = mat;

  // create gizmo
  var utilLayer = new BABYLON.UtilityLayerRenderer(scene);
  var gizmo = new BABYLON.BoundingBoxGizmo(new BABYLON.Color3(1, 0, 0), utilLayer);
  gizmo.setEnabledRotationAxis("");
  gizmo.scaleBoxSize = 0.5;
  gizmo.attachedMesh = selectionCube;

  // Add draggin behaviour
  var boxDragBehavior = new BABYLON.PointerDragBehavior();
  boxDragBehavior.onDragEndObservable.add(() => {
    selectCellsInCube(SPS, selectionCube);
  });

  selectionCube.addBehavior(boxDragBehavior);

  // Add scaling behaviour
  gizmo.onScaleBoxDragEndObservable.add(() => {
    selectCellsInCube(SPS, selectionCube);
  });

  // by default do not show selection Cube
  selectionCube.visibility = 0;
  gizmo.gizmoLayer.shouldRender = false;

  return [selectionCube, gizmo];
}

/**
 * Returns a list of same length as cells with true if in selection cube
 * @param {BABYLON.SolidParticleSystem} SPS Solid Particle System
 * @param {BABYLON.Mesh} cube Selection cube
 */
function selectCellsInCube(SPS, cube) {
  if (showSelectCube) {
    var boundInfo = cube.getBoundingInfo().boundingBox;
    // array for storing selected cells
    cellsInside = [];
    for (var i = 0; i < SPS.nbParticles; i++) {
      isInside = particleInBox(SPS.particles[i].position, boundInfo.minimumWorld, boundInfo.maximumWorld);
      cellsInside.push(isInside);
      // cells inside box are colored red, all others are colored blue
      if (isInside) {
        SPS.particles[i].color = new BABYLON.Color3(1, 0, 0);
      } else {
        SPS.particles[i].color = new BABYLON.Color3(0.3, 0.3, 0.8);
      }
    }
    colored = false;
    SPS.setParticles();
    // send selection to shiny server
    Shiny.setInputValue("cellSelection", cellsInside);
    return cellsInside;
  }
}

/**
 * Check if particle is inside of a bounding box
 * @param {Object} position Contains x, y, z coordinates of particle
 * @param {Object} min minimum x, y, z coordinates
 * @param {Object} max maximum x, y, z coordinates
 */
function particleInBox(position, min, max) {
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
 * Creates a color legend for the plot
 * @param {Array} legendInfo [[color, text], ...]
 */
function createLegend(legendInfo) {
  // create fullscreen GUI texture
  var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // create grid for placing legend in correct position
  var grid = new BABYLON.GUI.Grid();
  advancedTexture.addControl(grid);

  // number of clusters
  var n = legendInfo.length;
  // main position of legend (right middle)
  grid.addColumnDefinition(0.8);
  grid.addColumnDefinition(0.2);
  grid.addRowDefinition(0.25);
  
  // for continuous measures display viridis color bar and max and min values.
  if (legendInfo[0][0] == 'max') {
    isSequential = true;
    grid.addRowDefinition(300, true);
    grid.addRowDefinition(0.25);

    var innerGrid = new BABYLON.GUI.Grid();
    innerGrid.addColumnDefinition(0.2);
    innerGrid.addColumnDefinition(0.8);
    innerGrid.addRowDefinition(1);
    grid.addControl(innerGrid, 1, 1);
    
    // viridis color bar
    var image = new BABYLON.GUI.Image("colorbar", "viridis.png");
    image.height = "300px";
    image.stretch = BABYLON.GUI.Image.STRETCH_UNIFORM;
    innerGrid.addControl(image, 0, 0);

    // label text
    var labelGrid = new BABYLON.GUI.Grid();
    labelGrid.addColumnDefinition(1);
    labelGrid.addRowDefinition(0.05);
    labelGrid.addRowDefinition(0.9);
    labelGrid.addRowDefinition(0.05);
    innerGrid.addControl(labelGrid, 0, 1);

    var legendText = new BABYLON.GUI.TextBlock();
    legendText.text = legendInfo[0][1];
    legendText.color = "black";
    legendText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    labelGrid.addControl(legendText, 0, 0);

    var legendText = new BABYLON.GUI.TextBlock();
    legendText.text = legendInfo[1][1];
    legendText.color = "black";
    legendText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    labelGrid.addControl(legendText, 2, 0);

    return advancedTexture;
  }
  isSequential = false;
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
    legendColor.background = legendInfo[i][0];
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
    legendText.text = legendInfo[i][1];
    legendText.color = "black";
    legendText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    // use second column for many entries
    if (i > 11) {
      innerGrid.addControl(legendText, i - 12, 3);
    } else {
      innerGrid.addControl(legendText, i, 1);
    }
  }
  // return the UI texture to make it disposable later
  return advancedTexture;
}

function create3dVis(canvas, coords) {
    engine = new BABYLON.Engine(canvas);
    scene = createScene(engine);
}