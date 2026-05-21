// toolbar.js - Toolbar Buttons, Colors Palette and Keyboard Shortcuts
import * as THREE from 'three';
import { state } from './state.js';
import { createGeometry, createLight, createEmptyGroup, createCamera, deleteSelectedObject, focusCameraOnObject } from './objects.js';
import { ChangeColorCommand, BatchColorCommand, UpdateAnimationTracksCommand } from './history.js';
import { triggerImport } from './io.js';
import { toggleEditMode, getGizmoManager } from './editMode.js';
import { deleteSelectedElements, createFaceFromSelection } from './editTools.js';
import { selectAll, deselectAll } from './editSelection.js';

export function initToolbar() {
  // Elements
  const btnAddMenu = document.getElementById('btn-add-menu');
  const addMenu = document.getElementById('add-menu');
  const btnDelete = document.getElementById('btn-delete');
  
  const btnTranslate = document.getElementById('btn-mode-translate');
  const btnRotate = document.getElementById('btn-mode-rotate');
  const btnScale = document.getElementById('btn-mode-scale');
  
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  
  const btnColorMenu = document.getElementById('btn-color-menu');
  const colorMenu = document.getElementById('color-menu');
  const customColorInput = document.getElementById('custom-color-input');
  const customColorText = document.getElementById('custom-color-text');
  const swatches = document.querySelectorAll('.palette-swatch');
  const colorTargetSelected = document.getElementById('color-target-selected');
  
  const btnToggleGrid = document.getElementById('btn-toggle-grid');
  const btnToggleBloom = document.getElementById('btn-toggle-bloom');
  const bloomStrengthSlider = document.getElementById('bloom-strength-slider');
  const bloomStrengthValue = document.getElementById('bloom-strength-value');
  const bloomStrengthContainer = document.getElementById('bloom-strength-container');
  
  const btnImportTrigger = document.getElementById('btn-import-trigger');
  const importInput = document.getElementById('import-input');
  const btnExport = document.getElementById('btn-export');
  
  const statusUndoDepth = document.getElementById('status-undo-depth');
  const colorPreviewCircle = btnColorMenu.querySelector('.color-preview-circle');

  // Camera switcher elements
  const btnCameraSelect = document.getElementById('btn-camera-select');
  const cameraSelectDropdown = document.getElementById('camera-select-dropdown');
  const activeCameraName = document.getElementById('active-camera-name');

  // Timeline elements
  const btnTimelinePrev = document.getElementById('btn-timeline-prev');
  const btnTimelinePlay = document.getElementById('btn-timeline-play');
  const btnTimelineStop = document.getElementById('btn-timeline-stop');
  const btnTimelineNext = document.getElementById('btn-timeline-next');
  const btnTimelineKeyframe = document.getElementById('btn-timeline-keyframe');
  const btnTimelineClearKeys = document.getElementById('btn-timeline-clear-keys');
  const timelineTimeCurrent = document.getElementById('timeline-time-current');
  const timelineTimeDuration = document.getElementById('timeline-time-duration');
  const timelineScrubber = document.getElementById('timeline-scrubber');
  const timelineKeyframesTrack = document.getElementById('timeline-keyframes-track');
  const iconPlay = document.getElementById('icon-play');

  // --- DROPDOWN MENUS ---
  btnAddMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    addMenu.classList.toggle('hidden');
    colorMenu.classList.add('hidden'); // Close other dropdowns
  });

  btnColorMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    colorMenu.classList.toggle('hidden');
    addMenu.classList.add('hidden'); // Close other dropdowns
  });

  // Close menus when clicking outside
  document.addEventListener('click', () => {
    addMenu.classList.add('hidden');
    colorMenu.classList.add('hidden');
    cameraSelectDropdown.classList.add('hidden');
  });

  // Prevent closing when clicking inside color menu
  colorMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // --- ADD OBJECTS ---
  addMenu.querySelectorAll('[data-add]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.getAttribute('data-add');
      if (type === 'group') {
        createEmptyGroup();
      } else if (type.endsWith('-light')) {
        createLight(type);
      } else if (type === 'camera') {
        createCamera();
      } else {
        createGeometry(type);
      }
      addMenu.classList.add('hidden');
    });
  });

  // --- DELETE OBJECT ---
  btnDelete.addEventListener('click', deleteSelectedObject);

  // --- TRANSFORM MODES ---
  function setTransformMode(mode) {
    if (!state.transformControls) return;
    state.transformControls.setMode(mode);
    
    // Update active styles
    btnTranslate.classList.toggle('active', mode === 'translate');
    btnRotate.classList.toggle('active', mode === 'rotate');
    btnScale.classList.toggle('active', mode === 'scale');
  }

  btnTranslate.addEventListener('click', () => setTransformMode('translate'));
  btnRotate.addEventListener('click', () => setTransformMode('rotate'));
  btnScale.addEventListener('click', () => setTransformMode('scale'));

  // --- UNDO / REDO ---
  btnUndo.addEventListener('click', () => {
    if (state.history) state.history.undo();
  });

  btnRedo.addEventListener('click', () => {
    if (state.history) state.history.redo();
  });

  // Sync Undo/Redo button status
  state.addEventListener('history', () => {
    const hist = state.history;
    btnUndo.disabled = !hist.canUndo();
    btnRedo.disabled = !hist.canRedo();
    
    // Update labels and depths
    statusUndoDepth.textContent = `復原步驟: ${hist.undoStack.length}`;
    if (hist.canUndo()) {
      btnUndo.setAttribute('title', `復原: ${hist.getUndoActionName()} (Ctrl+Z)`);
    } else {
      btnUndo.setAttribute('title', '復原 (Ctrl+Z)');
    }
  });

  // --- WIREFRAME COLOR SELECTION ---
  function applyColor(hex) {
    const mode = colorTargetSelected.checked ? "selected" : "all";
    
    if (mode === "selected") {
      const obj = state.selectedObject;
      if (obj) {
        // Collect current color
        let currentHex = "#ffffff";
        obj.traverse(child => {
          if (child.isMesh && child.material) {
            currentHex = '#' + child.material.color.getHexString();
          }
        });
        
        // Execute Command
        if (currentHex.toLowerCase() !== hex.toLowerCase()) {
          const cmd = new ChangeColorCommand(obj, currentHex, hex);
          state.history.execute(cmd);
        }
      }
    } else {
      // Global apply
      const oldColorsMap = new Map();
      state.scene.traverse(child => {
        if (child.isMesh && child.material && !child.isGridHelper && !child.isAxesHelper) {
          oldColorsMap.set(child.uuid, '#' + child.material.color.getHexString());
        }
      });
      
      const cmd = new BatchColorCommand(oldColorsMap, hex);
      state.history.execute(cmd);
      
      // Update global color so next items get it
      state.setGlobalColor(hex);
    }
    
    // Sync quick color preview UI
    customColorInput.value = hex;
    customColorText.textContent = hex.toUpperCase();
    colorPreviewCircle.style.backgroundColor = hex;
    colorPreviewCircle.style.boxShadow = `0 0 6px ${hex}`;
  }

  // Swatch click
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-color');
      applyColor(color);
    });
  });

  // Custom color input
  customColorInput.addEventListener('input', (e) => {
    const hex = e.target.value;
    customColorText.textContent = hex.toUpperCase();
    applyColor(hex);
  });

  // Sync color changes from properties panel back to toolbar if necessary
  state.addEventListener('color', (hex) => {
    customColorInput.value = hex;
    customColorText.textContent = hex.toUpperCase();
    colorPreviewCircle.style.backgroundColor = hex;
    colorPreviewCircle.style.boxShadow = `0 0 6px ${hex}`;
  });

  // --- GRID TOGGLE ---
  btnToggleGrid.addEventListener('click', () => {
    state.isGridVisible = !state.isGridVisible;
    btnToggleGrid.classList.toggle('active', state.isGridVisible);
    if (state.gridHelper) {
      state.gridHelper.visible = state.isGridVisible;
    }
    if (state.axesHelper) {
      state.axesHelper.visible = state.isGridVisible;
    }
  });

  // --- BLOOM EFFECTS TOGGLE ---
  btnToggleBloom.addEventListener('click', () => {
    state.isBloomEnabled = !state.isBloomEnabled;
    btnToggleBloom.classList.toggle('active', state.isBloomEnabled);
    
    // Toggle slider container usability and opacity
    if (bloomStrengthContainer) {
      if (state.isBloomEnabled) {
        bloomStrengthContainer.style.opacity = '1';
        bloomStrengthContainer.style.pointerEvents = 'auto';
        if (bloomStrengthSlider) bloomStrengthSlider.disabled = false;
      } else {
        bloomStrengthContainer.style.opacity = '0.3';
        bloomStrengthContainer.style.pointerEvents = 'none';
        if (bloomStrengthSlider) bloomStrengthSlider.disabled = true;
      }
    }
  });

  // --- BLOOM STRENGTH SLIDER ---
  if (bloomStrengthSlider) {
    bloomStrengthSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.bloomStrength = val;
      if (bloomStrengthValue) {
        bloomStrengthValue.textContent = val.toFixed(1);
      }
      // Update the active shader pass intensity directly
      if (state.bloomPass) {
        state.bloomPass.strength = val;
      }
    });
  }

  // --- IMPORT / EXPORT TRIGGERS ---
  btnImportTrigger.addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      triggerImport(e.target.files);
      // Reset input value so same file can be selected again
      e.target.value = '';
    }
  });

  // Trigger export when clicking export button
  btnExport.addEventListener('click', () => {
    // Dynamic import to avoid circular dependency
    import('./io.js').then(io => {
      io.triggerExport();
    });
  });

  // --- KEYBOARD SHORTCUTS ---
  window.addEventListener('keydown', (e) => {
    // Ignore hotkeys when user is editing input fields or textareas
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Command + Key combinations
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (state.history) state.history.undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (state.history) state.history.redo();
      }
      return;
    }

    // --- Tab: Toggle Edit Mode ---
    if (e.key === 'Tab') {
      e.preventDefault();
      toggleEditMode();
      return;
    }

    // --- Edit Mode specific shortcuts ---
    if (state.editorMode === 'edit') {
      switch (e.key.toLowerCase()) {
        case '1':
          setEditSubMode('vertex');
          return;
        case '2':
          setEditSubMode('edge');
          return;
        case '3':
          setEditSubMode('face');
          return;
        case 'x':
        case 'delete':
        case 'backspace':
          deleteSelectedElements();
          return;
        case 'f':
          createFaceFromSelection();
          return;
        case 'a':
          // Toggle select all
          const hasSelection = state.selectedVertices.size > 0 || state.selectedEdges.size > 0 || state.selectedFaces.size > 0;
          if (hasSelection) {
            deselectAll();
          } else {
            selectAll();
          }
          return;
        case 'escape':
          // Exit edit mode
          toggleEditMode();
          return;
        case 't':
          setTransformMode('translate');
          return;
        case 'r':
          setTransformMode('rotate');
          return;
        case 's':
          setTransformMode('scale');
          return;
      }
      return; // Don't fall through to Object Mode shortcuts
    }

    // --- Object Mode shortcuts ---
    switch(e.key.toLowerCase()) {
      case 't':
        setTransformMode('translate');
        break;
      case 'r':
        setTransformMode('rotate');
        break;
      case 's':
        setTransformMode('scale');
        break;
      case 'delete':
      case 'backspace':
        deleteSelectedObject();
        break;
      case 'escape':
        state.setSelectedObject(null);
        break;
      case 'f':
        if (state.selectedObject) {
          focusCameraOnObject(state.selectedObject);
        }
        break;
      case 'b':
        btnToggleBloom.click();
        break;
      case 'g':
        btnToggleGrid.click();
        break;
      case ' ':
        e.preventDefault();
        state.togglePlay();
        break;
      case 'k':
        e.preventDefault();
        if (btnTimelineKeyframe) {
          btnTimelineKeyframe.click();
        }
        break;
      // Quick preset swatches 1-6
      case '1': applyColor('#00ffff'); break;
      case '2': applyColor('#bf00ff'); break;
      case '3': applyColor('#39ff14'); break;
      case '4': applyColor('#ff6600'); break;
      case '5': applyColor('#ff0066'); break;
      case '6': applyColor('#e0e0ff'); break;
    }
  });

  // --- EDIT MODE UI WIRING ---
  const btnEditToggle = document.getElementById('btn-edit-toggle');
  const editSubModes = document.getElementById('edit-sub-modes');
  const editToolsGroup = document.getElementById('edit-tools-group');
  const btnSubVertex = document.getElementById('btn-sub-vertex');
  const btnSubEdge = document.getElementById('btn-sub-edge');
  const btnSubFace = document.getElementById('btn-sub-face');
  const btnEditDelete = document.getElementById('btn-edit-delete');
  const btnEditFill = document.getElementById('btn-edit-fill');
  const viewportContainer = document.getElementById('canvas-container');
  const statusEditorMode = document.getElementById('status-editor-mode');
  const statusEditInfo = document.getElementById('status-edit-info');

  // Edit mode toggle button
  btnEditToggle.addEventListener('click', () => {
    toggleEditMode();
  });

  // Sub-mode buttons
  function setEditSubMode(mode) {
    state.setEditSubMode(mode);
    btnSubVertex.classList.toggle('active', mode === 'vertex');
    btnSubEdge.classList.toggle('active', mode === 'edge');
    btnSubFace.classList.toggle('active', mode === 'face');

    // Update gizmo visibility
    const gm = getGizmoManager();
    if (gm) gm.updateSubModeVisibility();
  }

  btnSubVertex.addEventListener('click', () => setEditSubMode('vertex'));
  btnSubEdge.addEventListener('click', () => setEditSubMode('edge'));
  btnSubFace.addEventListener('click', () => setEditSubMode('face'));

  // Edit tools
  btnEditDelete.addEventListener('click', () => deleteSelectedElements());
  btnEditFill.addEventListener('click', () => createFaceFromSelection());

  // React to mode changes
  state.addEventListener('modeChange', (data) => {
    const isEdit = data.mode === 'edit';

    // Toggle button active state
    btnEditToggle.classList.toggle('active', isEdit);

    // Show/hide sub-mode and tools UI
    if (isEdit) {
      editSubModes.classList.remove('hidden');
      editToolsGroup.classList.remove('hidden');
      viewportContainer.classList.add('edit-mode');
    } else {
      editSubModes.classList.add('hidden');
      editToolsGroup.classList.add('hidden');
      viewportContainer.classList.remove('edit-mode');
    }

    // Update status bar
    if (isEdit) {
      statusEditorMode.innerHTML = '<i data-lucide="pen-tool" class="inline-icon"></i> 編輯模式';
      statusEditorMode.classList.add('edit-active');
    } else {
      statusEditorMode.innerHTML = '<i data-lucide="box" class="inline-icon"></i> 物件模式';
      statusEditorMode.classList.remove('edit-active');
    }

    if (window.lucide) window.lucide.createIcons();
  });

  // React to edit selection changes — update status bar info
  state.addEventListener('editSelection', (data) => {
    if (!statusEditInfo) return;
    const mode = state.editSubMode;
    let info = '';

    if (mode === 'vertex') {
      info = `頂點選取: ${state.selectedVertices.size}`;
    } else if (mode === 'edge') {
      info = `邊選取: ${state.selectedEdges.size}`;
    } else if (mode === 'face') {
      info = `面選取: ${state.selectedFaces.size}`;
    }

    if (state.editorMode === 'edit') {
      statusEditInfo.textContent = ` | ${info}`;
      statusEditInfo.classList.remove('hidden');
    } else {
      statusEditInfo.classList.add('hidden');
    }
  });

  // --- CAMERA VIEWPORT SWITCHER WIRING ---
  function updateCameraDropdown() {
    cameraSelectDropdown.innerHTML = '';
    
    // Editor Camera Option
    const editorCamBtn = document.createElement('button');
    editorCamBtn.className = 'menu-item';
    if (!state.activeViewportCamera || state.activeViewportCamera === state.camera) {
      editorCamBtn.classList.add('active');
    }
    editorCamBtn.innerHTML = '<i data-lucide="video"></i>自由視角 (Editor Camera)';
    editorCamBtn.addEventListener('click', () => {
      state.setActiveViewportCamera(state.camera);
      cameraSelectDropdown.classList.add('hidden');
    });
    cameraSelectDropdown.appendChild(editorCamBtn);
    
    // Scene Cameras from scene children
    state.scene.traverse(child => {
      if (child.isSceneCamera) {
        const cameraInstance = child.getObjectByName("CameraInstance");
        if (cameraInstance) {
          const camBtn = document.createElement('button');
          camBtn.className = 'menu-item';
          if (state.activeViewportCamera === cameraInstance) {
            camBtn.classList.add('active');
          }
          camBtn.innerHTML = `<i data-lucide="video"></i>${child.name}`;
          camBtn.addEventListener('click', () => {
            state.setActiveViewportCamera(cameraInstance);
            cameraSelectDropdown.classList.add('hidden');
          });
          cameraSelectDropdown.appendChild(camBtn);
        }
      }
    });
    
    if (window.lucide) window.lucide.createIcons();
  }

  btnCameraSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    updateCameraDropdown();
    cameraSelectDropdown.classList.toggle('hidden');
    addMenu.classList.add('hidden');
    colorMenu.classList.add('hidden');
  });

  state.addEventListener('cameraChange', (activeCam) => {
    if (!activeCam || activeCam === state.camera) {
      activeCameraName.textContent = "自由視角 (Editor Camera)";
    } else {
      let camName = "Scene Camera";
      state.scene.traverse(child => {
        if (child.isSceneCamera && child.getObjectByName("CameraInstance") === activeCam) {
          camName = child.name;
        }
      });
      activeCameraName.textContent = camName;
    }
  });

  // --- ANIMATION TIMELINE WIRING ---
  timelineScrubber.addEventListener('input', (e) => {
    const time = parseFloat(e.target.value);
    state.setAnimationTime(time, true);
  });

  btnTimelinePlay.addEventListener('click', () => {
    state.togglePlay();
  });

  btnTimelineStop.addEventListener('click', () => {
    if (state.timeline.isPlaying) {
      state.togglePlay();
    }
    state.setAnimationTime(0.0, true);
  });

  btnTimelinePrev.addEventListener('click', () => {
    const step = 1 / state.timeline.fps;
    state.setAnimationTime(state.timeline.currentTime - step, true);
  });

  btnTimelineNext.addEventListener('click', () => {
    const step = 1 / state.timeline.fps;
    state.setAnimationTime(state.timeline.currentTime + step, true);
  });

  btnTimelineKeyframe.addEventListener('click', () => {
    const obj = state.selectedObject;
    if (!obj) {
      alert("請先選擇一個物件來新增關鍵影格！");
      return;
    }
    
    const time = state.timeline.currentTime;
    const oldTracks = obj.userData.animationTracks || {};
    const newTracks = JSON.parse(JSON.stringify(oldTracks));

    function insertIntoTracks(tracks, trackName, t, val) {
      if (!tracks[trackName]) {
        tracks[trackName] = [];
      }
      const track = tracks[trackName];
      const existingIdx = track.findIndex(kf => Math.abs(kf.time - t) < 0.01);
      if (existingIdx !== -1) {
        track[existingIdx].value = val;
      } else {
        track.push({
          time: t,
          value: val,
          leftHandle: { timeOffset: -0.2, valueOffset: 0.0 },
          rightHandle: { timeOffset: 0.2, valueOffset: 0.0 }
        });
        track.sort((a, b) => a.time - b.time);
      }
    }

    // 1. Position X, Y, Z
    insertIntoTracks(newTracks, 'position.x', time, obj.position.x);
    insertIntoTracks(newTracks, 'position.y', time, obj.position.y);
    insertIntoTracks(newTracks, 'position.z', time, obj.position.z);

    // 2. Rotation X, Y, Z (convert to degrees)
    insertIntoTracks(newTracks, 'rotation.x', time, obj.rotation.x * (180 / Math.PI));
    insertIntoTracks(newTracks, 'rotation.y', time, obj.rotation.y * (180 / Math.PI));
    insertIntoTracks(newTracks, 'rotation.z', time, obj.rotation.z * (180 / Math.PI));

    // 3. Scale X, Y, Z (if not camera/light)
    if (!obj.isSceneCamera && !obj.isLight) {
      insertIntoTracks(newTracks, 'scale.x', time, obj.scale.x);
      insertIntoTracks(newTracks, 'scale.y', time, obj.scale.y);
      insertIntoTracks(newTracks, 'scale.z', time, obj.scale.z);
    }

    // 4. FOV (if camera)
    if (obj.isSceneCamera) {
      insertIntoTracks(newTracks, 'fov', time, obj.fov);
    }

    // 5. Intensity (if light)
    if (obj.isLight) {
      insertIntoTracks(newTracks, 'intensity', time, obj.intensity);
    }

    // 6. Material Wireframe Color (R, G, B channels in [0, 1])
    let colorRGB = null;
    obj.traverse(child => {
      if (child.isMesh && child.material && child.material.color) {
        colorRGB = child.material.color;
      }
    });
    if (colorRGB) {
      insertIntoTracks(newTracks, 'color.r', time, colorRGB.r);
      insertIntoTracks(newTracks, 'color.g', time, colorRGB.g);
      insertIntoTracks(newTracks, 'color.b', time, colorRGB.b);
    }

    const cmd = new UpdateAnimationTracksCommand(obj, oldTracks, newTracks);
    state.history.execute(cmd);
  });

  btnTimelineClearKeys.addEventListener('click', () => {
    const obj = state.selectedObject;
    if (!obj) {
      alert("請先選擇一個物件來清除關鍵影格！");
      return;
    }
    
    if (confirm(`確定要清除物件 "${obj.name}" 的所有動畫關鍵影格嗎？`)) {
      const oldTracks = obj.userData.animationTracks || {};
      const newTracks = {};
      const cmd = new UpdateAnimationTracksCommand(obj, oldTracks, newTracks);
      state.history.execute(cmd);
    }
  });

  state.addEventListener('timelineChange', (data) => {
    if (data.time !== undefined) {
      timelineScrubber.value = data.time;
      timelineTimeCurrent.textContent = `${data.time.toFixed(1)}s`;
    }
    
    if (data.isPlaying !== undefined) {
      if (data.isPlaying) {
        btnTimelinePlay.classList.add('active');
        iconPlay.setAttribute('data-lucide', 'pause');
      } else {
        btnTimelinePlay.classList.remove('active');
        iconPlay.setAttribute('data-lucide', 'play');
      }
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // Keyframe track markers visualization
  function updateScrubberMarkers(object) {
    timelineKeyframesTrack.innerHTML = '';
    if (!object || !object.userData) return;
    
    const uniqueTimes = new Set();

    // 1. Legacy Camera keyframes
    if (object.isSceneCamera && object.userData.keyframes) {
      object.userData.keyframes.forEach(kf => uniqueTimes.add(kf.time));
    }

    // 2. New Multi-track animation tracks keyframes
    if (object.userData.animationTracks) {
      for (const trackName in object.userData.animationTracks) {
        const track = object.userData.animationTracks[trackName];
        if (track) {
          track.forEach(kf => uniqueTimes.add(kf.time));
        }
      }
    }

    const duration = state.timeline.duration || 10.0;
    
    uniqueTimes.forEach(time => {
      const pct = (time / duration) * 100;
      const marker = document.createElement('div');
      marker.className = 'timeline-keyframe-marker';
      marker.style.left = `${pct}%`;
      marker.title = `關鍵影格: ${time.toFixed(2)}s`;
      
      // Click marker to jump directly to that time
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        state.setAnimationTime(time, true);
      });
      
      timelineKeyframesTrack.appendChild(marker);
    });
  }

  state.addEventListener('selection', (obj) => {
    updateScrubberMarkers(obj);
  });
  
  state.addEventListener('cameraChange', () => {
    const obj = state.selectedObject;
    updateScrubberMarkers(obj);
  });

  // Initialize Curve Editor Canvas module
  new CurveEditor();
}

/**
 * Interactive canvas-driven Cubic Bezier Curve Editor Class.
 * Supports zoom, pan, interactive keyframe dragging, and circular Bezier handles.
 */
class CurveEditor {
  constructor() {
    this.canvas = document.getElementById('curve-editor-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.tabTimeline = document.getElementById('btn-tab-timeline');
    this.tabCurve = document.getElementById('btn-tab-curve');
    this.trackView = document.getElementById('timeline-track-view');
    this.curveView = document.getElementById('timeline-curve-view');
    this.propertySelect = document.getElementById('curve-property-select');
    this.btnFit = document.getElementById('btn-curve-fit');
    this.btnDeleteKey = document.getElementById('btn-curve-delete-key');
    
    // Editor Transform state (zoom/pan mapping)
    this.panX = 60; // Pixels from left representing time=0
    this.panY = 80; // Pixels from top representing value=0
    this.zoomX = 50; // Pixels per second
    this.zoomY = 40; // Pixels per unit value
    
    // Drag & Interactive State
    this.selectedKeyframe = null;
    this.selectedHandle = null; // 'left' or 'right'
    this.isDragging = false;
    this.isPanning = false;
    this.dragStartMouse = { x: 0, y: 0 };
    this.dragStartPan = { x: 0, y: 0 };
    this.dragStartKfState = null;
    
    // Store tracks copy when starting modification to generate clean history command
    this.originalTracksSnapshot = null;
    
    this.initEvents();
  }
  
  get currentTrackName() {
    return this.propertySelect.value;
  }
  
  get targetObject() {
    return state.selectedObject;
  }
  
  initEvents() {
    // 1. Tab switches
    this.tabTimeline.addEventListener('click', () => this.switchView('timeline'));
    this.tabCurve.addEventListener('click', () => this.switchView('curve'));
    
    // 2. Window resizing
    window.addEventListener('resize', () => {
      if (!this.curveView.classList.contains('hidden')) {
        this.resizeCanvas();
        this.draw();
      }
    });
    
    // 3. Property select change
    this.propertySelect.addEventListener('change', () => {
      this.selectedKeyframe = null;
      this.selectedHandle = null;
      this.draw();
    });
    
    // 4. Fitting & Deletion buttons
    this.btnFit.addEventListener('click', () => this.fitView());
    this.btnDeleteKey.addEventListener('click', () => this.deleteSelectedKey());
    
    // 5. Mouse Gestures
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
    this.canvas.addEventListener('dblclick', (e) => this.onDblClick(e));
    
    // 6. Listen to scene & timeline updates to redraw live playback cursor
    state.addEventListener('timelineChange', () => {
      if (!this.curveView.classList.contains('hidden')) {
        this.draw();
      }
    });
    
    state.addEventListener('selection', () => {
      this.selectedKeyframe = null;
      this.selectedHandle = null;
      if (!this.curveView.classList.contains('hidden')) {
        this.draw();
      }
    });

    state.addEventListener('cameraChange', () => {
      if (!this.curveView.classList.contains('hidden')) {
        this.draw();
      }
    });
  }
  
  switchView(view) {
    if (view === 'timeline') {
      this.tabTimeline.classList.add('active');
      this.tabCurve.classList.remove('active');
      this.trackView.classList.remove('hidden');
      this.curveView.classList.add('hidden');
    } else {
      this.tabTimeline.classList.remove('active');
      this.tabCurve.classList.add('active');
      this.trackView.classList.add('hidden');
      this.curveView.classList.remove('hidden');
      this.resizeCanvas();
      this.fitView();
    }
  }
  
  resizeCanvas() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = 160;
  }
  
  screenToGraph(x, y) {
    const time = (x - this.panX) / this.zoomX;
    const value = -(y - this.panY) / this.zoomY;
    return { time, value };
  }
  
  graphToScreen(time, value) {
    const x = time * this.zoomX + this.panX;
    const y = -value * this.zoomY + this.panY;
    return { x, y };
  }
  
  fitView() {
    const obj = this.targetObject;
    if (!obj || !obj.userData.animationTracks) {
      this.draw();
      return;
    }
    const track = obj.userData.animationTracks[this.currentTrackName];
    if (!track || track.length === 0) {
      this.draw();
      return;
    }
    
    let minTime = Infinity, maxTime = -Infinity;
    let minValue = Infinity, maxValue = -Infinity;
    
    track.forEach(kf => {
      minTime = Math.min(minTime, kf.time);
      maxTime = Math.max(maxTime, kf.time);
      minValue = Math.min(minValue, kf.value);
      maxValue = Math.max(maxValue, kf.value);
      
      const rh = kf.rightHandle;
      const lh = kf.leftHandle;
      const rValOffset = (rh && rh.valueOffset !== undefined) ? rh.valueOffset : 0;
      const lValOffset = (lh && lh.valueOffset !== undefined) ? lh.valueOffset : 0;
      minValue = Math.min(minValue, kf.value + rValOffset, kf.value + lValOffset);
      maxValue = Math.max(maxValue, kf.value + rValOffset, kf.value + lValOffset);
    });
    
    if (minTime === maxTime) {
      minTime -= 1;
      maxTime += 1;
    }
    if (minValue === maxValue) {
      minValue -= 1;
      maxValue += 1;
    }
    
    const durationX = maxTime - minTime;
    const durationY = maxValue - minValue;
    
    const marginRatio = 0.15;
    this.zoomX = (this.canvas.width * (1 - 2 * marginRatio)) / durationX;
    this.zoomY = (this.canvas.height * (1 - 2 * marginRatio)) / durationY;
    
    this.zoomX = Math.max(5, Math.min(this.zoomX, 1000));
    this.zoomY = Math.max(5, Math.min(this.zoomY, 1000));
    
    const midTime = (minTime + maxTime) / 2;
    const midValue = (minValue + maxValue) / 2;
    
    this.panX = this.canvas.width / 2 - midTime * this.zoomX;
    this.panY = this.canvas.height / 2 + midValue * this.zoomY;
    
    this.draw();
  }
  
  deleteSelectedKey() {
    const obj = this.targetObject;
    if (!obj || !this.selectedKeyframe) return;
    
    const trackName = this.currentTrackName;
    if (!obj.userData.animationTracks || !obj.userData.animationTracks[trackName]) return;
    
    const oldTracks = obj.userData.animationTracks;
    const newTracks = JSON.parse(JSON.stringify(oldTracks));
    
    const track = newTracks[trackName];
    const idx = track.findIndex(kf => Math.abs(kf.time - this.selectedKeyframe.time) < 0.001);
    if (idx !== -1) {
      track.splice(idx, 1);
      
      const cmd = new UpdateAnimationTracksCommand(obj, oldTracks, newTracks);
      state.history.execute(cmd);
      
      this.selectedKeyframe = null;
      this.selectedHandle = null;
      this.draw();
    }
  }
  
  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    this.dragStartMouse = { x: mouseX, y: mouseY };
    
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.isPanning = true;
      this.dragStartPan = { x: this.panX, y: this.panY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    
    const obj = this.targetObject;
    if (!obj || !obj.userData.animationTracks) return;
    
    const track = obj.userData.animationTracks[this.currentTrackName];
    if (!track) return;
    
    const hitRadius = 8;
    
    if (this.selectedKeyframe) {
      const kf = this.selectedKeyframe;
      
      const rh = kf.rightHandle || { timeOffset: 0.2, valueOffset: 0 };
      const rightScr = this.graphToScreen(kf.time + rh.timeOffset, kf.value + rh.valueOffset);
      const dxR = mouseX - rightScr.x;
      const dyR = mouseY - rightScr.y;
      if (dxR*dxR + dyR*dyR <= hitRadius*hitRadius) {
        this.selectedHandle = 'right';
        this.isDragging = true;
        this.originalTracksSnapshot = JSON.parse(JSON.stringify(obj.userData.animationTracks));
        this.dragStartKfState = JSON.parse(JSON.stringify(kf));
        return;
      }
      
      const lh = kf.leftHandle || { timeOffset: -0.2, valueOffset: 0 };
      const leftScr = this.graphToScreen(kf.time + lh.timeOffset, kf.value + lh.valueOffset);
      const dxL = mouseX - leftScr.x;
      const dyL = mouseY - leftScr.y;
      if (dxL*dxL + dyL*dyL <= hitRadius*hitRadius) {
        this.selectedHandle = 'left';
        this.isDragging = true;
        this.originalTracksSnapshot = JSON.parse(JSON.stringify(obj.userData.animationTracks));
        this.dragStartKfState = JSON.parse(JSON.stringify(kf));
        return;
      }
    }
    
    for (let i = 0; i < track.length; i++) {
      const kf = track[i];
      const scr = this.graphToScreen(kf.time, kf.value);
      const dx = mouseX - scr.x;
      const dy = mouseY - scr.y;
      
      if (dx*dx + dy*dy <= hitRadius*hitRadius) {
        this.selectedKeyframe = kf;
        this.selectedHandle = null;
        this.isDragging = true;
        this.originalTracksSnapshot = JSON.parse(JSON.stringify(obj.userData.animationTracks));
        this.dragStartKfState = JSON.parse(JSON.stringify(kf));
        this.draw();
        return;
      }
    }
    
    this.selectedKeyframe = null;
    this.selectedHandle = null;
    this.draw();
  }
  
  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (this.isPanning) {
      const dx = mouseX - this.dragStartMouse.x;
      const dy = mouseY - this.dragStartMouse.y;
      this.panX = this.dragStartPan.x + dx;
      this.panY = this.dragStartPan.y + dy;
      this.draw();
      return;
    }
    
    if (this.isDragging && this.selectedKeyframe) {
      const obj = this.targetObject;
      const trackName = this.currentTrackName;
      const track = obj.userData.animationTracks[trackName];
      const kf = this.selectedKeyframe;
      
      const currentGraph = this.screenToGraph(mouseX, mouseY);
      const startGraph = this.screenToGraph(this.dragStartMouse.x, this.dragStartMouse.y);
      const deltaX = currentGraph.time - startGraph.time;
      const deltaY = currentGraph.value - startGraph.value;
      
      if (this.selectedHandle) {
        const originalKf = this.dragStartKfState;
        const idx = track.indexOf(kf);
        if (this.selectedHandle === 'right') {
          const rh = originalKf.rightHandle || { timeOffset: 0.2, valueOffset: 0 };
          let maxOffset = state.timeline.duration || 10.0;
          if (idx !== -1 && idx < track.length - 1) {
            maxOffset = track[idx + 1].time - kf.time;
          }
          kf.rightHandle = {
            timeOffset: Math.max(0.01, Math.min(maxOffset, (rh.timeOffset !== undefined ? rh.timeOffset : 0.2) + deltaX)),
            valueOffset: (rh.valueOffset !== undefined ? rh.valueOffset : 0) + deltaY
          };
        } else {
          const lh = originalKf.leftHandle || { timeOffset: -0.2, valueOffset: 0 };
          let maxOffset = state.timeline.duration || 10.0;
          if (idx !== -1 && idx > 0) {
            maxOffset = kf.time - track[idx - 1].time;
          }
          kf.leftHandle = {
            timeOffset: Math.min(-0.01, Math.max(-maxOffset, (lh.timeOffset !== undefined ? lh.timeOffset : -0.2) + deltaX)),
            valueOffset: (lh.valueOffset !== undefined ? lh.valueOffset : 0) + deltaY
          };
        }
      } else {
        const originalKf = this.dragStartKfState;
        
        let newTime = originalKf.time + deltaX;
        let newValue = originalKf.value + deltaY;
        
        const idx = track.indexOf(kf);
        let minT = 0;
        let maxT = state.timeline.duration || 10.0;
        
        if (idx > 0) minT = track[idx - 1].time + 0.05;
        if (idx < track.length - 1) maxT = track[idx + 1].time - 0.05;
        
        kf.time = Math.max(minT, Math.min(newTime, maxT));
        kf.value = newValue;
      }
      
      state.triggerEvent('cameraChange', obj);
      state.setAnimationTime(state.timeline.currentTime, false);
      this.draw();
    }
  }
  
  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    
    if (this.isDragging) {
      this.isDragging = false;
      
      const obj = this.targetObject;
      if (obj && this.originalTracksSnapshot) {
        const newTracksSnapshot = JSON.parse(JSON.stringify(obj.userData.animationTracks));
        const cmd = new UpdateAnimationTracksCommand(obj, this.originalTracksSnapshot, newTracksSnapshot);
        state.history.execute(cmd);
      }
      this.originalTracksSnapshot = null;
      this.draw();
    }
  }
  
  onWheel(e) {
    e.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const pivot = this.screenToGraph(mouseX, mouseY);
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    
    if (e.shiftKey) {
      this.zoomX = Math.max(5, Math.min(this.zoomX * zoomFactor, 10000));
    } else if (e.altKey) {
      this.zoomY = Math.max(5, Math.min(this.zoomY * zoomFactor, 10000));
    } else {
      this.zoomX = Math.max(5, Math.min(this.zoomX * zoomFactor, 10000));
      this.zoomY = Math.max(5, Math.min(this.zoomY * zoomFactor, 10000));
    }
    
    this.panX = mouseX - pivot.time * this.zoomX;
    this.panY = mouseY + pivot.value * this.zoomY;
    
    this.draw();
  }
  
  onDblClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const graph = this.screenToGraph(mouseX, mouseY);
    const obj = this.targetObject;
    if (!obj) return;
    
    const trackName = this.currentTrackName;
    const oldTracks = obj.userData.animationTracks || {};
    const newTracks = JSON.parse(JSON.stringify(oldTracks));
    
    if (!newTracks[trackName]) {
      newTracks[trackName] = [];
    }
    
    const track = newTracks[trackName];
    const time = Math.max(0, Math.min(graph.time, state.timeline.duration || 10.0));
    
    const existingIdx = track.findIndex(kf => Math.abs(kf.time - time) < 0.05);
    if (existingIdx === -1) {
      track.push({
        time: time,
        value: graph.value,
        leftHandle: { timeOffset: -0.2, valueOffset: 0.0 },
        rightHandle: { timeOffset: 0.2, valueOffset: 0.0 }
      });
      track.sort((a, b) => a.time - b.time);
      
      const cmd = new UpdateAnimationTracksCommand(obj, oldTracks, newTracks);
      state.history.execute(cmd);
      
      const activeTrack = obj.userData.animationTracks[trackName];
      this.selectedKeyframe = activeTrack.find(kf => Math.abs(kf.time - time) < 0.001);
      this.selectedHandle = null;
      this.draw();
    }
  }
  
  refreshSelectedKeyframeReference() {
    if (!this.selectedKeyframe) return;
    const obj = this.targetObject;
    if (!obj || !obj.userData.animationTracks) {
      this.selectedKeyframe = null;
      this.selectedHandle = null;
      return;
    }
    const track = obj.userData.animationTracks[this.currentTrackName];
    if (!track) {
      this.selectedKeyframe = null;
      this.selectedHandle = null;
      return;
    }
    const matched = track.find(kf => Math.abs(kf.time - this.selectedKeyframe.time) < 0.005);
    if (matched) {
      this.selectedKeyframe = matched;
    } else {
      this.selectedKeyframe = null;
      this.selectedHandle = null;
    }
  }

  draw() {
    this.refreshSelectedKeyframeReference();
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);
    
    this.drawGrid(w, h);
    
    const obj = this.targetObject;
    if (!obj || !obj.userData.animationTracks) {
      this.drawEmptyMessage("選擇一個物件來編輯動畫曲線...");
      return;
    }
    
    const track = obj.userData.animationTracks[this.currentTrackName];
    if (!track || track.length === 0) {
      this.drawEmptyMessage(`尚未在此屬性 (${this.currentTrackName}) 標記關鍵影格。雙擊空白處新增。`);
      return;
    }
    
    this.drawCurve(track);
    this.drawHandles();
    this.drawKeyframePoints(track);
    this.drawPlayhead(h);
  }
  
  drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    
    const timeStep = this.zoomX > 150 ? 0.2 : (this.zoomX > 60 ? 0.5 : (this.zoomX > 20 ? 1.0 : 2.0));
    
    const startT = Math.floor(this.screenToGraph(0, 0).time / timeStep) * timeStep;
    const endT = Math.ceil(this.screenToGraph(w, 0).time / timeStep) * timeStep;
    
    for (let t = startT - timeStep; t <= endT + timeStep; t += timeStep) {
      if (t < 0) continue;
      const x = this.graphToScreen(t, 0).x;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = '9px monospace';
      ctx.fillText(`${t.toFixed(1)}s`, x + 4, h - 6);
    }
    
    const valStep = this.zoomY > 150 ? 0.1 : (this.zoomY > 60 ? 0.5 : (this.zoomY > 20 ? 1.0 : (this.zoomY > 5 ? 5.0 : 10.0)));
    
    const startV = Math.floor(this.screenToGraph(0, h).value / valStep) * valStep;
    const endV = Math.ceil(this.screenToGraph(0, 0).value / valStep) * valStep;
    
    for (let v = startV - valStep; v <= endV + valStep; v += valStep) {
      const y = this.graphToScreen(0, v).y;
      
      ctx.strokeStyle = Math.abs(v) < 0.01 ? 'rgba(0, 255, 204, 0.15)' : 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      
      ctx.fillStyle = Math.abs(v) < 0.01 ? '#00ffcc' : 'rgba(255, 255, 255, 0.25)';
      ctx.font = '9px monospace';
      ctx.fillText(v.toFixed(1), 6, y - 4);
    }
  }
  
  drawCurve(track) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 255, 255, 0.4)';
    ctx.shadowBlur = 6;
    
    ctx.beginPath();
    
    const firstScr = this.graphToScreen(track[0].time, track[0].value);
    ctx.moveTo(0, firstScr.y);
    ctx.lineTo(firstScr.x, firstScr.y);
    
    for (let i = 0; i < track.length - 1; i++) {
      const kfA = track[i];
      const kfB = track[i + 1];
      
      const t1 = kfA.time;
      const v1 = kfA.value;
      const t2 = kfB.time;
      const v2 = kfB.value;
      
      const duration = t2 - t1;
      const rh = kfA.rightHandle;
      const lh = kfB.leftHandle;

      const rTimeOffset = (rh && rh.timeOffset !== undefined) ? rh.timeOffset : duration / 3;
      const rValOffset = (rh && rh.valueOffset !== undefined) ? rh.valueOffset : 0;
      const lTimeOffset = (lh && lh.timeOffset !== undefined) ? lh.timeOffset : -duration / 3;
      const lValOffset = (lh && lh.valueOffset !== undefined) ? lh.valueOffset : 0;

      const clampedRTimeOffset = Math.max(0, Math.min(duration, rTimeOffset));
      const clampedLTimeOffset = Math.min(0, Math.max(-duration, lTimeOffset));

      const cp1x = t1 + clampedRTimeOffset;
      const cp1y = v1 + rValOffset;
      const cp2x = t2 + clampedLTimeOffset;
      const cp2y = v2 + lValOffset;
      
      const steps = 40;
      for (let j = 0; j <= steps; j++) {
        const u = j / steps;
        
        const x = (1-u)*(1-u)*(1-u)*t1 + 3*(1-u)*(1-u)*u*cp1x + 3*(1-u)*u*u*cp2x + u*u*u*t2;
        const y = (1-u)*(1-u)*(1-u)*v1 + 3*(1-u)*(1-u)*u*cp1y + 3*(1-u)*u*u*cp2y + u*u*u*v2;
        
        const scr = this.graphToScreen(x, y);
        ctx.lineTo(scr.x, scr.y);
      }
    }
    
    const lastKf = track[track.length - 1];
    const lastScr = this.graphToScreen(lastKf.time, lastKf.value);
    ctx.lineTo(this.canvas.width, lastScr.y);
    ctx.stroke();
    
    ctx.shadowBlur = 0;
  }
  
  drawHandles() {
    if (!this.selectedKeyframe) return;
    
    const ctx = this.ctx;
    const kf = this.selectedKeyframe;
    const centerScr = this.graphToScreen(kf.time, kf.value);
    
    ctx.lineWidth = 1.5;
    
    // Find track to clamp correctly
    const obj = this.targetObject;
    let track = null;
    if (obj && obj.userData.animationTracks) {
      track = obj.userData.animationTracks[this.currentTrackName];
    }
    const idx = track ? track.indexOf(kf) : -1;
    
    const rh = kf.rightHandle;
    const rTimeOffset = (rh && rh.timeOffset !== undefined) ? rh.timeOffset : 0.2;
    const rValOffset = (rh && rh.valueOffset !== undefined) ? rh.valueOffset : 0;
    let rMax = state.timeline.duration || 10.0;
    if (track && idx !== -1 && idx < track.length - 1) {
      rMax = track[idx + 1].time - kf.time;
    }
    const clampedRTime = Math.max(0.01, Math.min(rMax, rTimeOffset));
    
    const rightScr = this.graphToScreen(kf.time + clampedRTime, kf.value + rValOffset);
    ctx.strokeStyle = '#bf00ff';
    ctx.beginPath();
    ctx.moveTo(centerScr.x, centerScr.y);
    ctx.lineTo(rightScr.x, rightScr.y);
    ctx.stroke();
    
    ctx.fillStyle = this.selectedHandle === 'right' ? '#fff' : '#bf00ff';
    ctx.beginPath();
    ctx.arc(rightScr.x, rightScr.y, 4, 0, 2*Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    
    const lh = kf.leftHandle;
    const lTimeOffset = (lh && lh.timeOffset !== undefined) ? lh.timeOffset : -0.2;
    const lValOffset = (lh && lh.valueOffset !== undefined) ? lh.valueOffset : 0;
    let lMax = state.timeline.duration || 10.0;
    if (track && idx !== -1 && idx > 0) {
      lMax = kf.time - track[idx - 1].time;
    }
    const clampedLTime = Math.min(-0.01, Math.max(-lMax, lTimeOffset));
    
    const leftScr = this.graphToScreen(kf.time + clampedLTime, kf.value + lValOffset);
    ctx.strokeStyle = '#bf00ff';
    ctx.beginPath();
    ctx.moveTo(centerScr.x, centerScr.y);
    ctx.lineTo(leftScr.x, leftScr.y);
    ctx.stroke();
    
    ctx.fillStyle = this.selectedHandle === 'left' ? '#fff' : '#bf00ff';
    ctx.beginPath();
    ctx.arc(leftScr.x, leftScr.y, 4, 0, 2*Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  
  drawKeyframePoints(track) {
    const ctx = this.ctx;
    
    track.forEach(kf => {
      const scr = this.graphToScreen(kf.time, kf.value);
      const isSelected = (this.selectedKeyframe && Math.abs(this.selectedKeyframe.time - kf.time) < 0.001);
      
      ctx.fillStyle = isSelected ? '#ffffff' : '#00ffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.rect(scr.x - 4, scr.y - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
    });
  }
  
  drawPlayhead(h) {
    const ctx = this.ctx;
    const curTime = state.timeline.currentTime;
    const x = this.graphToScreen(curTime, 0).x;
    
    if (x >= 0 && x <= this.canvas.width) {
      ctx.strokeStyle = '#ff3366';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      
      ctx.fillStyle = '#ff3366';
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 5, 0);
      ctx.lineTo(x, 8);
      ctx.closePath();
      ctx.fill();
    }
  }
  
  drawEmptyMessage(msg) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, this.canvas.width / 2, this.canvas.height / 2);
    ctx.textAlign = 'left';
  }
}
