// toolbar.js - Toolbar Buttons, Colors Palette and Keyboard Shortcuts
import * as THREE from 'three';
import { state } from './state.js';
import { createGeometry, createLight, createEmptyGroup, deleteSelectedObject, focusCameraOnObject } from './objects.js';
import { ChangeColorCommand, BatchColorCommand } from './history.js';
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
  
  const btnToggleBloom = document.getElementById('btn-toggle-bloom');
  const bloomStrengthSlider = document.getElementById('bloom-strength-slider');
  const bloomStrengthValue = document.getElementById('bloom-strength-value');
  const bloomStrengthContainer = document.getElementById('bloom-strength-container');
  
  const btnImportTrigger = document.getElementById('btn-import-trigger');
  const importInput = document.getElementById('import-input');
  const btnExport = document.getElementById('btn-export');
  
  const statusUndoDepth = document.getElementById('status-undo-depth');
  const colorPreviewCircle = btnColorMenu.querySelector('.color-preview-circle');

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
}
