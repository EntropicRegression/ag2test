// editSelection.js - Sub-element Selection in Edit Mode
// Supports both click-select and Windows-style box/marquee selection
import * as THREE from 'three';
import { state } from './state.js';

let editData = null;
let gizmoManager = null;
let isActive = false;

// Drag/box selection state
let pointerDownPos = null; // {x, y, clientX, clientY}
let isBoxSelecting = false;
let boxSelectDiv = null;
const BOX_THRESHOLD = 6; // pixels: above this = box select, below = click select

// Bound event handler references for cleanup
let onPointerDown = null;
let onPointerMove = null;
let onPointerUp = null;

export function initEditSelection(data, gizmo) {
  editData = data;
  gizmoManager = gizmo;
  isActive = true;

  // Create box select overlay div
  boxSelectDiv = document.getElementById('box-select-overlay');
  if (!boxSelectDiv) {
    boxSelectDiv = document.createElement('div');
    boxSelectDiv.id = 'box-select-overlay';
    document.getElementById('canvas-container').appendChild(boxSelectDiv);
  }
  boxSelectDiv.style.display = 'none';

  const dom = state.renderer.domElement;

  onPointerDown = (e) => {
    if (!isActive || state.editorMode !== 'edit') return;
    if (e.button !== 0) return;

    // 檢查點擊位置是否在 Transform Gizmo 上
    if (state.transformControls) {
      try {
        const rect = dom.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, state.camera);
        
        const gizmoHelper = state.transformControls.getHelper();
        const gizmoIntersects = raycaster.intersectObject(gizmoHelper, true);
        if (gizmoIntersects.length > 0) {
          // 正在操作或點選 Gizmo，不啟動框選
          pointerDownPos = null;
          isBoxSelecting = false;
          return;
        }
      } catch (err) {
        // 忽略射線相交錯誤
      }
    }

    const rect = dom.getBoundingClientRect();
    pointerDownPos = {
      clientX: e.clientX,
      clientY: e.clientY,
      rectX: e.clientX - rect.left,
      rectY: e.clientY - rect.top
    };
    isBoxSelecting = false;
  };

  onPointerMove = (e) => {
    if (!isActive || state.editorMode !== 'edit' || !pointerDownPos) return;
    if (e.buttons !== 1) return; // 左鍵必須按住

    // 如果正在拖拽 Gizmo，阻斷並清空框選狀態
    if (state.transformControls && state.transformControls.dragging) {
      pointerDownPos = null;
      isBoxSelecting = false;
      if (boxSelectDiv) boxSelectDiv.style.display = 'none';
      return;
    }

    const dx = e.clientX - pointerDownPos.clientX;
    const dy = e.clientY - pointerDownPos.clientY;
    const dist = Math.hypot(dx, dy);

    if (dist > BOX_THRESHOLD) {
      isBoxSelecting = true;
      updateBoxSelectVisual(e);
    }
  };

  onPointerUp = (e) => {
    if (!isActive || state.editorMode !== 'edit') return;
    if (e.button !== 0) return;

    // 如果正在拖拽 Gizmo，阻斷並清空框選狀態
    if (state.transformControls && state.transformControls.dragging) {
      pointerDownPos = null;
      isBoxSelecting = false;
      if (boxSelectDiv) boxSelectDiv.style.display = 'none';
      return;
    }

    if (!pointerDownPos) return;

    const dx = e.clientX - pointerDownPos.clientX;
    const dy = e.clientY - pointerDownPos.clientY;
    const dist = Math.hypot(dx, dy);

    const shiftKey = e.shiftKey;

    if (dist <= BOX_THRESHOLD) {
      // 點擊選取（單一元素）
      handleClickSelect(e, shiftKey);
    } else {
      // 框選
      handleBoxSelect(e, shiftKey);
    }

    // 隱藏框選外觀
    if (boxSelectDiv) boxSelectDiv.style.display = 'none';
    pointerDownPos = null;
    isBoxSelecting = false;
  };

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
}

export function disposeEditSelection() {
  isActive = false;
  const dom = state.renderer?.domElement;
  if (dom) {
    if (onPointerDown) dom.removeEventListener('pointerdown', onPointerDown);
    if (onPointerMove) dom.removeEventListener('pointermove', onPointerMove);
    if (onPointerUp) dom.removeEventListener('pointerup', onPointerUp);
  }
  onPointerDown = null;
  onPointerMove = null;
  onPointerUp = null;

  // Remove box select overlay
  if (boxSelectDiv && boxSelectDiv.parentNode) {
    boxSelectDiv.parentNode.removeChild(boxSelectDiv);
  }
  boxSelectDiv = null;
  editData = null;
  gizmoManager = null;
}

// ---- BOX SELECT VISUAL ----
function updateBoxSelectVisual(e) {
  if (!boxSelectDiv || !pointerDownPos) return;

  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();

  const x1 = pointerDownPos.clientX - rect.left;
  const y1 = pointerDownPos.clientY - rect.top;
  const x2 = e.clientX - rect.left;
  const y2 = e.clientY - rect.top;

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  boxSelectDiv.style.display = 'block';
  boxSelectDiv.style.left = left + 'px';
  boxSelectDiv.style.top = top + 'px';
  boxSelectDiv.style.width = width + 'px';
  boxSelectDiv.style.height = height + 'px';
}

// ---- CLICK SELECT (single element) ----
function handleClickSelect(e, shiftKey) {
  const dom = state.renderer.domElement;
  const rect = dom.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, state.camera);

  switch (state.editSubMode) {
    case 'vertex':
      clickSelectVertex(raycaster, shiftKey);
      break;
    case 'edge':
      clickSelectEdge(raycaster, shiftKey);
      break;
    case 'face':
      clickSelectFace(raycaster, shiftKey);
      break;
  }
}

// ---- BOX SELECT (marquee) ----
function handleBoxSelect(e, shiftKey) {
  if (!editData || !gizmoManager) return;

  const dom = state.renderer.domElement;
  const rect = dom.getBoundingClientRect();

  // Calculate normalized box in screen space (0..1)
  const x1 = (pointerDownPos.clientX - rect.left) / rect.width;
  const y1 = (pointerDownPos.clientY - rect.top) / rect.height;
  const x2 = (e.clientX - rect.left) / rect.width;
  const y2 = (e.clientY - rect.top) / rect.height;

  const boxLeft = Math.min(x1, x2);
  const boxRight = Math.max(x1, x2);
  const boxTop = Math.min(y1, y2);
  const boxBottom = Math.max(y1, y2);

  if (!shiftKey) {
    // Clear current selection before box select
    state.selectedVertices.clear();
    state.selectedEdges.clear();
    state.selectedFaces.clear();
  }

  switch (state.editSubMode) {
    case 'vertex':
      boxSelectVertices(boxLeft, boxRight, boxTop, boxBottom);
      break;
    case 'edge':
      boxSelectEdges(boxLeft, boxRight, boxTop, boxBottom);
      break;
    case 'face':
      boxSelectFaces(boxLeft, boxRight, boxTop, boxBottom);
      break;
  }
}

// Project a world position to normalized screen coords (0..1)
function projectToScreen(worldPos) {
  const v = worldPos.clone().project(state.camera);
  return {
    x: (v.x + 1) / 2,    // 0..1 from left
    y: (-v.y + 1) / 2,    // 0..1 from top
    z: v.z                 // depth (for behind-camera check)
  };
}

function isInBox(screenPos, left, right, top, bottom) {
  return screenPos.z >= -1 && screenPos.z <= 1 &&
         screenPos.x >= left && screenPos.x <= right &&
         screenPos.y >= top && screenPos.y <= bottom;
}

// ---- VERTEX BOX SELECT ----
function boxSelectVertices(left, right, top, bottom) {
  for (let i = 0; i < editData.positions.length; i++) {
    const worldPos = editData.getVertexWorldPos(i);
    const screenPos = projectToScreen(worldPos);
    if (isInBox(screenPos, left, right, top, bottom)) {
      state.selectedVertices.add(i);
    }
  }
  gizmoManager.updateVertexHighlight(state.selectedVertices);
  state.notifyEditSelectionChanged();
}

// ---- EDGE BOX SELECT ----
function boxSelectEdges(left, right, top, bottom) {
  for (const edge of editData.edges) {
    const wp1 = editData.getVertexWorldPos(edge.v1);
    const wp2 = editData.getVertexWorldPos(edge.v2);
    const sp1 = projectToScreen(wp1);
    const sp2 = projectToScreen(wp2);
    // Select edge if both endpoints are in box
    if (isInBox(sp1, left, right, top, bottom) && isInBox(sp2, left, right, top, bottom)) {
      state.selectedEdges.add(edge.key);
    }
  }
  gizmoManager.updateEdgeHighlight(state.selectedEdges);
  state.notifyEditSelectionChanged();
}

// ---- FACE BOX SELECT ----
function boxSelectFaces(left, right, top, bottom) {
  for (let i = 0; i < editData.faces.length; i++) {
    const face = editData.faces[i];
    const wpA = editData.getVertexWorldPos(face.a);
    const wpB = editData.getVertexWorldPos(face.b);
    const wpC = editData.getVertexWorldPos(face.c);

    // Select face if centroid is in box
    const centroid = new THREE.Vector3(
      (wpA.x + wpB.x + wpC.x) / 3,
      (wpA.y + wpB.y + wpC.y) / 3,
      (wpA.z + wpB.z + wpC.z) / 3
    );
    const screenPos = projectToScreen(centroid);
    if (isInBox(screenPos, left, right, top, bottom)) {
      state.selectedFaces.add(i);
    }
  }
  gizmoManager.updateFaceHighlight(state.selectedFaces);
  state.notifyEditSelectionChanged();
}

// ---- CLICK SELECT VERTEX ----
function clickSelectVertex(raycaster, shiftKey) {
  if (!editData || !gizmoManager) return;

  const pickTargets = gizmoManager.vertexPickSpheres;
  const intersects = raycaster.intersectObjects(pickTargets, false);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const vertexIndex = hit.userData.vertexIndex;

    if (shiftKey) {
      if (state.selectedVertices.has(vertexIndex)) {
        state.selectedVertices.delete(vertexIndex);
      } else {
        state.selectedVertices.add(vertexIndex);
      }
    } else {
      state.selectedVertices.clear();
      state.selectedVertices.add(vertexIndex);
    }
  } else {
    if (!shiftKey) {
      state.selectedVertices.clear();
    }
  }

  gizmoManager.updateVertexHighlight(state.selectedVertices);
  state.notifyEditSelectionChanged();
}

// ---- CLICK SELECT EDGE ----
function clickSelectEdge(raycaster, shiftKey) {
  if (!editData || !gizmoManager) return;

  const edges = editData.edges;
  let closestEdgeKey = null;
  let closestDist = 0.3;

  const ray = raycaster.ray;

  for (const edge of edges) {
    const p1 = editData.getVertexWorldPos(edge.v1);
    const p2 = editData.getVertexWorldPos(edge.v2);
    const dist = distanceRayToSegment(ray, p1, p2);
    if (dist < closestDist) {
      closestDist = dist;
      closestEdgeKey = edge.key;
    }
  }

  if (closestEdgeKey) {
    if (shiftKey) {
      if (state.selectedEdges.has(closestEdgeKey)) {
        state.selectedEdges.delete(closestEdgeKey);
      } else {
        state.selectedEdges.add(closestEdgeKey);
      }
    } else {
      state.selectedEdges.clear();
      state.selectedEdges.add(closestEdgeKey);
    }
  } else {
    if (!shiftKey) {
      state.selectedEdges.clear();
    }
  }

  gizmoManager.updateEdgeHighlight(state.selectedEdges);
  state.notifyEditSelectionChanged();
}

// ---- CLICK SELECT FACE ----
function clickSelectFace(raycaster, shiftKey) {
  if (!editData) return;

  const intersects = raycaster.intersectObject(editData.mesh, false);

  if (intersects.length > 0) {
    const hit = intersects[0];
    let faceIndex = hit.faceIndex;

    if (faceIndex !== undefined && faceIndex !== null) {
      if (shiftKey) {
        if (state.selectedFaces.has(faceIndex)) {
          state.selectedFaces.delete(faceIndex);
        } else {
          state.selectedFaces.add(faceIndex);
        }
      } else {
        state.selectedFaces.clear();
        state.selectedFaces.add(faceIndex);
      }
    }
  } else {
    if (!shiftKey) {
      state.selectedFaces.clear();
    }
  }

  gizmoManager.updateFaceHighlight(state.selectedFaces);
  state.notifyEditSelectionChanged();
}

// ---- MATH HELPERS ----
function distanceRayToSegment(ray, segA, segB) {
  const segDir = new THREE.Vector3().subVectors(segB, segA);
  const segLen = segDir.length();
  if (segLen < 1e-6) return ray.distanceToPoint(segA);

  segDir.normalize();

  const diff = new THREE.Vector3().subVectors(ray.origin, segA);
  const a = ray.direction.dot(ray.direction);
  const b = ray.direction.dot(segDir);
  const c = segDir.dot(segDir);
  const d = ray.direction.dot(diff);
  const e = segDir.dot(diff);

  const denom = a * c - b * b;
  let s, t;

  if (Math.abs(denom) < 1e-6) {
    s = 0;
    t = e / c;
  } else {
    s = (b * e - c * d) / denom;
    t = (a * e - b * d) / denom;
  }

  t = Math.max(0, Math.min(segLen, t));
  s = Math.max(0, s);

  const closestOnRay = new THREE.Vector3().copy(ray.origin).addScaledVector(ray.direction, s);
  const closestOnSeg = new THREE.Vector3().copy(segA).addScaledVector(segDir, t);

  return closestOnRay.distanceTo(closestOnSeg);
}

// Select all elements of current sub-mode
export function selectAll() {
  if (state.editorMode !== 'edit' || !editData) return;

  switch (state.editSubMode) {
    case 'vertex':
      for (let i = 0; i < editData.positions.length; i++) {
        state.selectedVertices.add(i);
      }
      gizmoManager.updateVertexHighlight(state.selectedVertices);
      break;
    case 'edge':
      for (const edge of editData.edges) {
        state.selectedEdges.add(edge.key);
      }
      gizmoManager.updateEdgeHighlight(state.selectedEdges);
      break;
    case 'face':
      for (let i = 0; i < editData.faces.length; i++) {
        state.selectedFaces.add(i);
      }
      gizmoManager.updateFaceHighlight(state.selectedFaces);
      break;
  }

  state.notifyEditSelectionChanged();
}

// Deselect all
export function deselectAll() {
  state.selectedVertices.clear();
  state.selectedEdges.clear();
  state.selectedFaces.clear();

  if (gizmoManager) {
    gizmoManager.updateVertexHighlight(state.selectedVertices);
    gizmoManager.updateEdgeHighlight(state.selectedEdges);
    gizmoManager.updateFaceHighlight(state.selectedFaces);
  }

  state.notifyEditSelectionChanged();
}
