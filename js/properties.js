// properties.js - Double-Binding Property Panel
import * as THREE from 'three';
import { state } from './state.js';
import { ChangePropertyCommand, ChangeColorCommand } from './history.js';

// DOM elements
const noSelectionMsg = document.getElementById('no-selection-message');
const propsPanel = document.getElementById('properties-panel');

const propName = document.getElementById('prop-name');
const propPosX = document.getElementById('prop-pos-x');
const propPosY = document.getElementById('prop-pos-y');
const propPosZ = document.getElementById('prop-pos-z');

const propRotX = document.getElementById('prop-rot-x');
const propRotY = document.getElementById('prop-rot-y');
const propRotZ = document.getElementById('prop-rot-z');

const propScaleX = document.getElementById('prop-scale-x');
const propScaleY = document.getElementById('prop-scale-y');
const propScaleZ = document.getElementById('prop-scale-z');

const propColor = document.getElementById('prop-color');
const propColorHex = document.getElementById('prop-color-hex');
const propVisible = document.getElementById('prop-visible');

const lightPropsGroup = document.querySelector('.light-properties');
const propLightIntensity = document.getElementById('prop-light-intensity');

// Keep track of old values before change starts to log in Undo stack
let valueBeforeEdit = null;

export function initProperties() {
  // Listen to state changes
  state.addEventListener('selection', updatePanel);
  state.addEventListener('properties', updatePanel);

  // Listen for Edit Mode selection changes
  state.addEventListener('editSelection', updateEditModePanel);
  state.addEventListener('modeChange', (data) => {
    if (data.mode === 'object') {
      // Returning to Object Mode — restore normal panel
      updatePanel(state.selectedObject);
    }
  });

  // Setup inputs events
  setupInputListeners();
}

function updateEditModePanel() {
  if (state.editorMode !== 'edit') return;

  // Import getEditData dynamically to avoid circular deps
  import('./editMode.js').then(({ getEditData }) => {
    const editData = getEditData();
    if (!editData) return;

    noSelectionMsg.classList.add('hidden');
    propsPanel.classList.remove('hidden');

    const mode = state.editSubMode;

    if (mode === 'vertex' && state.selectedVertices.size > 0) {
      // Show first selected vertex position
      const firstIdx = state.selectedVertices.values().next().value;
      const pos = editData.getVertexLocalPos(firstIdx);

      propName.value = `頂點 #${firstIdx} (共選取 ${state.selectedVertices.size} 個)`;
      propPosX.value = parseFloat(pos.x.toFixed(3));
      propPosY.value = parseFloat(pos.y.toFixed(3));
      propPosZ.value = parseFloat(pos.z.toFixed(3));
    } else if (mode === 'edge' && state.selectedEdges.size > 0) {
      const firstKey = state.selectedEdges.values().next().value;
      const [v1Str, v2Str] = firstKey.split('-');
      const v1 = parseInt(v1Str), v2 = parseInt(v2Str);
      const p1 = editData.getVertexLocalPos(v1);
      const p2 = editData.getVertexLocalPos(v2);
      const length = p1.distanceTo(p2);

      propName.value = `邊 ${firstKey} (共選取 ${state.selectedEdges.size} 條)`;
      propPosX.value = parseFloat(((p1.x + p2.x) / 2).toFixed(3));
      propPosY.value = parseFloat(((p1.y + p2.y) / 2).toFixed(3));
      propPosZ.value = parseFloat(((p1.z + p2.z) / 2).toFixed(3));
    } else if (mode === 'face' && state.selectedFaces.size > 0) {
      const firstFaceIdx = state.selectedFaces.values().next().value;
      propName.value = `面 #${firstFaceIdx} (共選取 ${state.selectedFaces.size} 個)`;
    } else {
      propName.value = `編輯模式 — ${mode === 'vertex' ? '頂點' : mode === 'edge' ? '邊' : '面'}`;
    }
  });
}

function updatePanel(targetObj) {
  const obj = targetObj || state.selectedObject;
  
  if (!obj) {
    noSelectionMsg.classList.remove('hidden');
    propsPanel.classList.add('hidden');
    return;
  }
  
  noSelectionMsg.classList.add('hidden');
  propsPanel.classList.remove('hidden');

  // Prevent recursive trigger loop when user is actively focused on an input
  const activeEl = document.activeElement;

  // 1. Name
  if (activeEl !== propName) {
    propName.value = obj.name || "";
  }

  // 2. Position
  if (activeEl !== propPosX) propPosX.value = parseFloat(obj.position.x.toFixed(3));
  if (activeEl !== propPosY) propPosY.value = parseFloat(obj.position.y.toFixed(3));
  if (activeEl !== propPosZ) propPosZ.value = parseFloat(obj.position.z.toFixed(3));

  // 3. Rotation (Euler converted to degrees)
  if (activeEl !== propRotX) propRotX.value = Math.round(obj.rotation.x * (180 / Math.PI));
  if (activeEl !== propRotY) propRotY.value = Math.round(obj.rotation.y * (180 / Math.PI));
  if (activeEl !== propRotZ) propRotZ.value = Math.round(obj.rotation.z * (180 / Math.PI));

  // 4. Scale
  if (activeEl !== propScaleX) propScaleX.value = parseFloat(obj.scale.x.toFixed(3));
  if (activeEl !== propScaleY) propScaleY.value = parseFloat(obj.scale.y.toFixed(3));
  if (activeEl !== propScaleZ) propScaleZ.value = parseFloat(obj.scale.z.toFixed(3));

  // 5. Wireframe Color (traverse to get color from meshes)
  let matColorHex = "#ffffff";
  obj.traverse(child => {
    if (child.isMesh && child.material) {
      matColorHex = '#' + child.material.color.getHexString();
    }
  });
  
  if (activeEl !== propColor) {
    propColor.value = matColorHex;
    propColorHex.textContent = matColorHex.toUpperCase();
  }

  // 6. Visibility
  if (activeEl !== propVisible) {
    propVisible.checked = obj.visible;
  }

  // 7. Light Properties
  if (obj.isLight) {
    lightPropsGroup.classList.remove('hidden');
    if (activeEl !== propLightIntensity) {
      propLightIntensity.value = parseFloat(obj.intensity.toFixed(2));
    }
  } else {
    lightPropsGroup.classList.add('hidden');
  }
}

function setupInputListeners() {
  // Capture initial value on focus to enable single-step undo history logging
  const inputs = [
    propName, propPosX, propPosY, propPosZ,
    propRotX, propRotY, propRotZ,
    propScaleX, propScaleY, propScaleZ,
    propLightIntensity
  ];

  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      const obj = state.selectedObject;
      if (!obj) return;

      const propId = input.id;
      if (propId === 'prop-name') valueBeforeEdit = obj.name;
      else if (propId === 'prop-pos-x') valueBeforeEdit = obj.position.x;
      else if (propId === 'prop-pos-y') valueBeforeEdit = obj.position.y;
      else if (propId === 'prop-pos-z') valueBeforeEdit = obj.position.z;
      else if (propId === 'prop-rot-x') valueBeforeEdit = obj.rotation.x; // rad
      else if (propId === 'prop-rot-y') valueBeforeEdit = obj.rotation.y; // rad
      else if (propId === 'prop-rot-z') valueBeforeEdit = obj.rotation.z; // rad
      else if (propId === 'prop-scale-x') valueBeforeEdit = obj.scale.x;
      else if (propId === 'prop-scale-y') valueBeforeEdit = obj.scale.y;
      else if (propId === 'prop-scale-z') valueBeforeEdit = obj.scale.z;
      else if (propId === 'prop-light-intensity') valueBeforeEdit = obj.intensity;
    });

    // Real-time viewport feedback while typing
    input.addEventListener('input', () => {
      const obj = state.selectedObject;
      if (!obj) return;

      const propId = input.id;
      const val = parseFloat(input.value) || 0;

      if (propId === 'prop-name') {
        obj.name = input.value;
      } else if (propId === 'prop-pos-x') {
        obj.position.x = val;
      } else if (propId === 'prop-pos-y') {
        obj.position.y = val;
      } else if (propId === 'prop-pos-z') {
        obj.position.z = val;
      } else if (propId === 'prop-rot-x') {
        obj.rotation.x = val * (Math.PI / 180);
      } else if (propId === 'prop-rot-y') {
        obj.rotation.y = val * (Math.PI / 180);
      } else if (propId === 'prop-rot-z') {
        obj.rotation.z = val * (Math.PI / 180);
      } else if (propId === 'prop-scale-x') {
        obj.scale.x = val;
      } else if (propId === 'prop-scale-y') {
        obj.scale.y = val;
      } else if (propId === 'prop-scale-z') {
        obj.scale.z = val;
      } else if (propId === 'prop-light-intensity' && obj.isLight) {
        obj.intensity = val;
      }
      
      obj.updateMatrixWorld();
    });

    // Pushes actual command to Undo History stack on focus blur / confirmation
    input.addEventListener('change', () => {
      const obj = state.selectedObject;
      if (!obj || valueBeforeEdit === null) return;

      const propId = input.id;
      let finalVal = input.value;
      let propPath = "";
      
      if (propId !== 'prop-name') {
        finalVal = parseFloat(input.value) || 0;
      }

      if (propId === 'prop-name') propPath = 'name';
      else if (propId === 'prop-pos-x') { propPath = 'position.x'; }
      else if (propId === 'prop-pos-y') { propPath = 'position.y'; }
      else if (propId === 'prop-pos-z') { propPath = 'position.z'; }
      else if (propId === 'prop-rot-x') { propPath = 'rotation.x'; finalVal = finalVal * (Math.PI / 180); }
      else if (propId === 'prop-rot-y') { propPath = 'rotation.y'; finalVal = finalVal * (Math.PI / 180); }
      else if (propId === 'prop-rot-z') { propPath = 'rotation.z'; finalVal = finalVal * (Math.PI / 180); }
      else if (propId === 'prop-scale-x') { propPath = 'scale.x'; }
      else if (propId === 'prop-scale-y') { propPath = 'scale.y'; }
      else if (propId === 'prop-scale-z') { propPath = 'scale.z'; }
      else if (propId === 'prop-light-intensity') propPath = 'intensity';

      if (valueBeforeEdit !== finalVal) {
        const cmd = new ChangePropertyCommand(obj, propPath, valueBeforeEdit, finalVal);
        state.history.execute(cmd);
      }
      
      valueBeforeEdit = null;
    });
  });

  // Color picker events
  propColor.addEventListener('input', (e) => {
    const hex = e.target.value;
    propColorHex.textContent = hex.toUpperCase();
    
    // Preview in real-time
    const obj = state.selectedObject;
    if (obj) {
      obj.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.color.set(hex);
        }
      });
    }
  });

  propColor.addEventListener('change', (e) => {
    const obj = state.selectedObject;
    if (!obj) return;

    let currentHex = "#ffffff";
    obj.traverse(child => {
      if (child.isMesh && child.material) {
        currentHex = '#' + child.material.color.getHexString();
      }
    });

    const newHex = e.target.value;
    if (currentHex.toLowerCase() !== newHex.toLowerCase()) {
      const cmd = new ChangeColorCommand(obj, currentHex, newHex);
      state.history.execute(cmd);
    }
  });

  // Visibility checkbox events
  propVisible.addEventListener('change', (e) => {
    const obj = state.selectedObject;
    if (!obj) return;
    
    const visible = e.target.checked;
    if (obj.visible !== visible) {
      const cmd = new ChangePropertyCommand(obj, 'visible', obj.visible, visible);
      state.history.execute(cmd);
    }
  });
}
