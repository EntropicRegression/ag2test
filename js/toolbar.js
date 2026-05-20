// toolbar.js - Toolbar Buttons, Colors Palette and Keyboard Shortcuts
import * as THREE from 'three';
import { state } from './state.js';
import { createGeometry, createLight, createEmptyGroup, deleteSelectedObject, focusCameraOnObject } from './objects.js';
import { ChangeColorCommand, BatchColorCommand } from './history.js';
import { triggerImport } from './io.js';

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

    // Single keys
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
}
