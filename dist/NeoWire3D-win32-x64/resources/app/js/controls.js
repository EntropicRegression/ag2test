// controls.js - OrbitControls & TransformControls Integration
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { state } from './state.js';
import { TransformCommand } from './history.js';

export function initControls() {
  const container = document.getElementById('canvas-container');

  // 1. Initialize OrbitControls
  const orbitControls = new OrbitControls(state.camera, state.renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.screenSpacePanning = true;
  orbitControls.minDistance = 1;
  orbitControls.maxDistance = 200;

  // Custom Mouse Button Mapping
  orbitControls.mouseButtons = {
    LEFT: null,                  // Left click reserved for selection / Raycaster
    MIDDLE: THREE.MOUSE.PAN,     // Middle click for Panning
    RIGHT: THREE.MOUSE.ROTATE    // Right click for Orbiting (Rotating view)
  };
  state.orbitControls = orbitControls;

  // 2. Initialize TransformControls (Gizmo)
  const transformControls = new TransformControls(state.camera, state.renderer.domElement);
  transformControls.size = 0.75;
  
  // In Three.js r169+, TransformControls no longer extends Object3D.
  // We must add its helper (the visual gizmo) to the scene instead.
  const gizmoHelper = transformControls.getHelper();
  state.scene.add(gizmoHelper);
  state.transformControls = transformControls;

  // OrbitControls vs TransformControls conflicts
  transformControls.addEventListener('dragging-changed', (event) => {
    state.orbitControls.enabled = !event.value;
  });

  // Real-time synchronization of property fields during Gizmo dragging
  transformControls.addEventListener('change', () => {
    if (transformControls.object) {
      state.notifyPropertiesChanged(transformControls.object);
    }
  });

  // Track Transform changes for Undo/Redo (Command Pattern)
  let oldTransformState = null;

  transformControls.addEventListener('mouseDown', () => {
    const targetObj = transformControls.object;
    if (targetObj) {
      oldTransformState = {
        position: targetObj.position.clone(),
        rotation: targetObj.rotation.clone(),
        scale: targetObj.scale.clone()
      };
    }
  });

  transformControls.addEventListener('mouseUp', () => {
    const targetObj = transformControls.object;
    if (targetObj && oldTransformState) {
      const newTransformState = {
        position: targetObj.position.clone(),
        rotation: targetObj.rotation.clone(),
        scale: targetObj.scale.clone()
      };

      // Check if change actually occurred
      const posDiff = oldTransformState.position.distanceTo(newTransformState.position);
      const rotDiff = Math.abs(oldTransformState.rotation.x - newTransformState.rotation.x) +
                      Math.abs(oldTransformState.rotation.y - newTransformState.rotation.y) +
                      Math.abs(oldTransformState.rotation.z - newTransformState.rotation.z);
      const scaleDiff = oldTransformState.scale.distanceTo(newTransformState.scale);

      if (posDiff > 0.0001 || rotDiff > 0.0001 || scaleDiff > 0.0001) {
        // Execute command and log into history stack
        const cmd = new TransformCommand(targetObj, oldTransformState, newTransformState);
        state.history.execute(cmd);
      }
      oldTransformState = null;
    }
  });
}
