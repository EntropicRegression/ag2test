// selection.js - Raycaster-based Object Selection
import * as THREE from 'three';
import { state } from './state.js';

let startX = 0;
let startY = 0;

export function initSelection() {
  const dom = state.renderer.domElement;

  dom.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
  });

  dom.addEventListener('pointerup', (e) => {
    // If user dragged more than 4 pixels, consider it camera orbiting/panning, not a click
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (dist > 4) return;

    // Only handle left clicks for selection
    if (e.button !== 0) return;

    // In Edit Mode, selection is handled by editSelection.js
    if (state.editorMode === 'edit') return;

    // Check if clicking on TransformControls gizmo handles (handled by TransformControls itself)
    if (state.transformControls && state.transformControls.dragging) return;

    // Normalizing mouse coordinates to (-1 to +1)
    const rect = dom.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.activeViewportCamera || state.camera);

    // Prevent selection from clearing when clicking directly on TransformControls gizmo axes
    if (state.transformControls) {
      try {
        const gizmoHelper = state.transformControls.getHelper();
        const gizmoIntersects = raycaster.intersectObject(gizmoHelper, true);
        if (gizmoIntersects.length > 0) {
          return;
        }
      } catch (e) {
        // Fallback: ignore gizmo intersection errors
      }
    }

    // Build a helper identity set for fast checking
    const gizmoHelper = state.transformControls ? state.transformControls.getHelper() : null;
    const excludeSet = new Set();
    if (gizmoHelper) {
      gizmoHelper.traverse(child => excludeSet.add(child));
    }

    // Get all children of the scene
    const targets = [];
    state.scene.traverse((obj) => {
      if (
        obj !== state.scene &&
        !obj.isGridHelper &&
        !obj.isAxesHelper &&
        !excludeSet.has(obj) &&
        obj.name !== 'LightHelper' &&
        obj.name !== '__EditModeHelpers__' &&
        !obj.userData.isEditPickHelper
      ) {
        targets.push(obj);
      }
    });

    const intersects = raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      // Find the closest valid object
      let hit = intersects[0].object;
      
      // If we clicked a light helper or custom mesh helper, select the actual target
      if (hit.parent && (hit.parent.isLight || hit.parent.type === 'PointLightHelper' || hit.parent.type === 'DirectionalLightHelper')) {
        state.setSelectedObject(hit.parent);
        return;
      }
      
      // If it's a submesh, let's bubble up to find the group under the root scene if it's imported
      let target = hit;
      while (target.parent && target.parent !== state.scene) {
        // If we hit a user-created Group or specific object, let's keep it or bubble
        // Usually, in a simple editor, we select the specific Mesh or Group that was added to the scene.
        if (target.parent.name && (target.parent.isGroup || target.parent.isObject3D)) {
          // If the parent is a top-level group directly under Scene, we might want to select the group!
          if (target.parent.parent === state.scene) {
            target = target.parent;
            break;
          }
        }
        target = target.parent;
      }
      
      state.setSelectedObject(target);
    } else {
      // Clicked on empty space: clear selection
      state.setSelectedObject(null);
    }
  });
}
