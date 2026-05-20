// editTools.js - Edit Mode Tools (Move, Rotate, Delete, Add vertex/edge/face)
import * as THREE from 'three';
import { state } from './state.js';
import { VertexMoveCommand, DeleteElementCommand, AddFaceCommand } from './history.js';

let editData = null;
let gizmoManager = null;
let isActive = false;

// Drag state for vertex movement
let isDragging = false;
let dragVertexIndices = [];
let dragStartPositions = [];
let dragPlane = new THREE.Plane();
let dragStartPoint = new THREE.Vector3();
let dragOffset = new THREE.Vector3();

// Drag state for Transform Gizmo
let isGizmoDragging = false;
let gizmoStartPositionsWorld = [];
let gizmoStartPositionsLocal = [];
let gizmoAffectedIndices = [];
let gizmoStartPivotWorld = new THREE.Vector3();

// Bound event references
let onMouseDown = null;
let onMouseMove = null;
let onMouseUp = null;
let onGizmoMouseDown = null;
let onGizmoChange = null;
let onGizmoMouseUp = null;

// Helper to get unique vertex indices involved in the selection
function getSelectedVertices() {
  const uniqueVerts = new Set();
  if (state.editSubMode === 'vertex' && state.selectedVertices.size > 0) {
    for (const idx of state.selectedVertices) {
      uniqueVerts.add(idx);
    }
  } else if (state.editSubMode === 'edge' && state.selectedEdges.size > 0) {
    for (const edgeKey of state.selectedEdges) {
      const edge = editData.edges.find(e => e.key === edgeKey);
      if (edge) {
        uniqueVerts.add(edge.v1);
        uniqueVerts.add(edge.v2);
      }
    }
  } else if (state.editSubMode === 'face' && state.selectedFaces.size > 0) {
    for (const faceIdx of state.selectedFaces) {
      const face = editData.faces[faceIdx];
      if (face) {
        uniqueVerts.add(face.a);
        uniqueVerts.add(face.b);
        uniqueVerts.add(face.c);
      }
    }
  }
  return Array.from(uniqueVerts);
}

function projectToClientCoords(worldPos) {
  const dom = state.renderer.domElement;
  const rect = dom.getBoundingClientRect();
  const v = worldPos.clone().project(state.camera);
  return {
    x: rect.left + (v.x + 1) * rect.width / 2,
    y: rect.top + (-v.y + 1) * rect.height / 2,
    z: v.z
  };
}

export function initEditTools(data, gizmo) {
  editData = data;
  gizmoManager = gizmo;
  isActive = true;

  const dom = state.renderer.domElement;

  onMouseDown = (e) => {
    if (!isActive || state.editorMode !== 'edit') return;
    if (e.button !== 0) return;
    if (state.editSubMode !== 'vertex') return;

    // Check if we have selected vertices to drag
    if (state.selectedVertices.size === 0) return;

    // Check if the click is near any selected vertex in screen space (threshold = 15 pixels)
    let clickedVertexIndex = -1;
    let closestDist = 15;

    for (const idx of state.selectedVertices) {
      const worldPos = editData.getVertexWorldPos(idx);
      const cp = projectToClientCoords(worldPos);
      if (cp.z > 1) continue;

      const dist = Math.hypot(e.clientX - cp.x, e.clientY - cp.y);
      if (dist < closestDist) {
        closestDist = dist;
        clickedVertexIndex = idx;
      }
    }

    if (clickedVertexIndex === -1) return;

    // Start dragging
    isDragging = true;
    dragVertexIndices = Array.from(state.selectedVertices);

    // Snapshot current positions for undo
    dragStartPositions = dragVertexIndices.map(idx => editData.getVertexLocalPos(idx));

    // Create drag plane facing camera at the clicked vertex world position
    const hitPoint = editData.getVertexWorldPos(clickedVertexIndex);
    const cameraDir = new THREE.Vector3();
    state.camera.getWorldDirection(cameraDir);
    dragPlane.setFromNormalAndCoplanarPoint(cameraDir.negate(), hitPoint);

    // Calculate offset from hit to first selected vertex world pos
    dragStartPoint.copy(hitPoint);

    // Disable orbit controls during drag
    if (state.orbitControls) {
      state.orbitControls.enabled = false;
    }

    e.stopPropagation();
  };

  onMouseMove = (e) => {
    if (!isDragging || !isActive) return;

    const rect = dom.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.camera);

    // Find intersection with drag plane
    const planeIntersect = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(dragPlane, planeIntersect)) return;

    // Calculate delta in world space
    const delta = new THREE.Vector3().subVectors(planeIntersect, dragStartPoint);

    // Convert delta to local space of the mesh
    const worldToLocal = new THREE.Matrix4().copy(editData.mesh.matrixWorld).invert();
    const localDelta = delta.clone().transformDirection(worldToLocal);

    // Apply delta to all selected vertices
    for (let i = 0; i < dragVertexIndices.length; i++) {
      const idx = dragVertexIndices[i];
      const newPos = dragStartPositions[i].clone().add(localDelta);
      editData.updateVertexPosition(idx, newPos);
    }

    // Refresh visual helpers
    gizmoManager.refreshPositions();
    gizmoManager.updateVertexHighlight(state.selectedVertices);
  };

  onMouseUp = (e) => {
    if (!isDragging) return;
    isDragging = false;

    // Re-enable orbit controls
    if (state.orbitControls) {
      state.orbitControls.enabled = true;
    }

    // Check if positions actually changed
    let changed = false;
    const newPositions = dragVertexIndices.map(idx => editData.getVertexLocalPos(idx));

    for (let i = 0; i < dragVertexIndices.length; i++) {
      if (dragStartPositions[i].distanceTo(newPositions[i]) > 0.0001) {
        changed = true;
        break;
      }
    }

    if (changed) {
      // Push undo command
      const cmd = new VertexMoveCommand(
        editData.mesh,
        dragVertexIndices.slice(),
        dragStartPositions.map(p => p.clone()),
        newPositions.map(p => p.clone()),
        editData,
        gizmoManager
      );
      // Execute without re-applying (positions already moved)
      state.history.undoStack.push(cmd);
      state.history.redoStack = [];
      state.notifyHistoryChanged();
    }

    dragVertexIndices = [];
    dragStartPositions = [];

    // Trigger update of selection gizmo centroid
    state.notifyEditSelectionChanged();
  };

  // Implement Transform Controls listeners
  onGizmoMouseDown = () => {
    if (!isActive || state.editorMode !== 'edit') return;

    const targetObj = state.transformControls?.object;
    if (!targetObj || targetObj.name !== '__EditGizmoTarget__') return;

    isGizmoDragging = true;
    gizmoAffectedIndices = getSelectedVertices();

    gizmoStartPivotWorld.copy(targetObj.position);
    gizmoStartPositionsLocal = gizmoAffectedIndices.map(idx => editData.getVertexLocalPos(idx));
    gizmoStartPositionsWorld = gizmoAffectedIndices.map(idx => editData.getVertexWorldPos(idx));
  };

  onGizmoChange = () => {
    if (!isGizmoDragging || !editData) return;

    const targetObj = state.transformControls?.object;
    if (!targetObj || targetObj.name !== '__EditGizmoTarget__') return;

    const C = targetObj.position;
    const Q = targetObj.quaternion;
    const S = targetObj.scale;

    const worldToLocal = new THREE.Matrix4().copy(editData.mesh.matrixWorld).invert();

    for (let i = 0; i < gizmoAffectedIndices.length; i++) {
      const idx = gizmoAffectedIndices[i];
      const x_world_0 = gizmoStartPositionsWorld[i];

      const offset = new THREE.Vector3().subVectors(x_world_0, gizmoStartPivotWorld);
      offset.set(offset.x * S.x, offset.y * S.y, offset.z * S.z);
      offset.applyQuaternion(Q);

      const x_world_new = new THREE.Vector3().addVectors(C, offset);
      const x_local_new = x_world_new.applyMatrix4(worldToLocal);

      editData.updateVertexPosition(idx, x_local_new);
    }

    gizmoManager.refreshPositions();

    if (state.editSubMode === 'vertex') {
      gizmoManager.updateVertexHighlight(state.selectedVertices);
    } else if (state.editSubMode === 'edge') {
      gizmoManager.updateEdgeHighlight(state.selectedEdges);
    } else if (state.editSubMode === 'face') {
      gizmoManager.updateFaceHighlight(state.selectedFaces);
    }
  };

  onGizmoMouseUp = () => {
    if (!isGizmoDragging) return;
    isGizmoDragging = false;

    let changed = false;
    const newLocalPositions = gizmoAffectedIndices.map(idx => editData.getVertexLocalPos(idx));

    for (let i = 0; i < gizmoAffectedIndices.length; i++) {
      if (gizmoStartPositionsLocal[i].distanceTo(newLocalPositions[i]) > 0.0001) {
        changed = true;
        break;
      }
    }

    if (changed) {
      const cmd = new VertexMoveCommand(
        editData.mesh,
        gizmoAffectedIndices.slice(),
        gizmoStartPositionsLocal.map(p => p.clone()),
        newLocalPositions.map(p => p.clone()),
        editData,
        gizmoManager
      );
      state.history.undoStack.push(cmd);
      state.history.redoStack = [];
      state.notifyHistoryChanged();
    }

    gizmoAffectedIndices = [];
    gizmoStartPositionsLocal = [];
    gizmoStartPositionsWorld = [];

    state.notifyEditSelectionChanged();
  };

  dom.addEventListener('pointerdown', onMouseDown, true);
  dom.addEventListener('pointermove', onMouseMove);
  dom.addEventListener('pointerup', onMouseUp);

  if (state.transformControls) {
    state.transformControls.addEventListener('mouseDown', onGizmoMouseDown);
    state.transformControls.addEventListener('change', onGizmoChange);
    state.transformControls.addEventListener('mouseUp', onGizmoMouseUp);
  }
}

export function disposeEditTools() {
  isActive = false;
  isDragging = false;
  isGizmoDragging = false;

  const dom = state.renderer?.domElement;
  if (dom) {
    if (onMouseDown) dom.removeEventListener('pointerdown', onMouseDown, true);
    if (onMouseMove) dom.removeEventListener('pointermove', onMouseMove);
    if (onMouseUp) dom.removeEventListener('pointerup', onMouseUp);
  }

  if (state.transformControls) {
    if (onGizmoMouseDown) state.transformControls.removeEventListener('mouseDown', onGizmoMouseDown);
    if (onGizmoChange) state.transformControls.removeEventListener('change', onGizmoChange);
    if (onGizmoMouseUp) state.transformControls.removeEventListener('mouseUp', onGizmoMouseUp);
  }

  onMouseDown = null;
  onMouseMove = null;
  onMouseUp = null;
  onGizmoMouseDown = null;
  onGizmoChange = null;
  onGizmoMouseUp = null;

  gizmoAffectedIndices = [];
  gizmoStartPositionsLocal = [];
  gizmoStartPositionsWorld = [];

  editData = null;
  gizmoManager = null;
}

// ---- DELETE SELECTED ELEMENTS ----
export function deleteSelectedElements() {
  if (!editData || state.editorMode !== 'edit') return;

  const mesh = editData.mesh;
  const geometry = mesh.geometry;

  // Snapshot geometry before deletion
  const geometrySnapshot = geometry.clone();
  const positionsSnapshot = editData.snapshotPositions();

  let changed = false;

  const index = geometry.index;

  if (index) {
    const oldIndices = Array.from(index.array);
    let newIndices = [];

    if (state.editSubMode === 'face' && state.selectedFaces.size > 0) {
      // 刪除選取的面
      for (let i = 0; i < oldIndices.length; i += 3) {
        const faceIdx = i / 3;
        if (!state.selectedFaces.has(faceIdx)) {
          newIndices.push(oldIndices[i], oldIndices[i + 1], oldIndices[i + 2]);
        }
      }
      changed = true;
    } else if (state.editSubMode === 'vertex' && state.selectedVertices.size > 0) {
      // 刪除選取的點，以及包含這些點的所有面
      const deletedVerts = state.selectedVertices;
      for (let i = 0; i < oldIndices.length; i += 3) {
        const a = oldIndices[i], b = oldIndices[i + 1], c = oldIndices[i + 2];
        if (!deletedVerts.has(a) && !deletedVerts.has(b) && !deletedVerts.has(c)) {
          newIndices.push(a, b, c);
        }
      }
      changed = true;
    } else if (state.editSubMode === 'edge' && state.selectedEdges.size > 0) {
      // 刪除選取的線，以及包含這些線的所有面
      for (let i = 0; i < oldIndices.length; i += 3) {
        const a = oldIndices[i], b = oldIndices[i + 1], c = oldIndices[i + 2];
        const edgeAB = a < b ? `${a}-${b}` : `${b}-${a}`;
        const edgeBC = b < c ? `${b}-${c}` : `${c}-${b}`;
        const edgeCA = c < a ? `${c}-${a}` : `${a}-${c}`;

        if (!state.selectedEdges.has(edgeAB) && !state.selectedEdges.has(edgeBC) && !state.selectedEdges.has(edgeCA)) {
          newIndices.push(a, b, c);
        }
      }
      changed = true;
    }

    if (changed) {
      // 1. 決定要保留哪些頂點
      // 在 vertex 模式下，必須明確移除被選取的頂點（即使它們已無任何面引用）
      // 其他模式下，如果點不再被任何面引用（isolated 孤立點），我們也將其一併移除
      const vertexCount = geometry.attributes.position.count;
      const keepVertex = new Uint8Array(vertexCount);

      // 標記所有仍在使用的頂點
      for (let i = 0; i < newIndices.length; i++) {
        keepVertex[newIndices[i]] = 1;
      }

      // 如果是 vertex 模式，強制將選取要刪除的點設為 0
      if (state.editSubMode === 'vertex') {
        for (const idx of state.selectedVertices) {
          keepVertex[idx] = 0;
        }
      }

      // 2. 建立舊索引到新索引的對照表 (oldIndex -> newIndex)
      const oldIndexToNewIndex = new Int32Array(vertexCount);
      let newVertexCount = 0;
      for (let i = 0; i < vertexCount; i++) {
        if (keepVertex[i] === 0) {
          oldIndexToNewIndex[i] = -1;
        } else {
          oldIndexToNewIndex[i] = newVertexCount;
          newVertexCount++;
        }
      }

      // 3. 重構 index 緩衝區，將剩餘的面索引重新對應至新頂點索引
      const remappedIndices = [];
      for (let i = 0; i < newIndices.length; i++) {
        const oldIdx = newIndices[i];
        const newIdx = oldIndexToNewIndex[oldIdx];
        if (newIdx !== -1) {
          remappedIndices.push(newIdx);
        } else {
          console.warn(`[Delete] 檢測到殘留面引用了已被刪除的頂點 ${oldIdx}`);
        }
      }

      // 4. 重構所有頂點屬性 (position, normal, uv, color 等)
      const newAttributes = {};
      for (const name in geometry.attributes) {
        const attr = geometry.attributes[name];
        const itemSize = attr.itemSize;
        const oldArray = attr.array;
        const newArray = new oldArray.constructor(newVertexCount * itemSize);

        for (let i = 0; i < vertexCount; i++) {
          const newIdx = oldIndexToNewIndex[i];
          if (newIdx !== -1) {
            for (let j = 0; j < itemSize; j++) {
              newArray[newIdx * itemSize + j] = oldArray[i * itemSize + j];
            }
          }
        }
        newAttributes[name] = new THREE.BufferAttribute(newArray, itemSize, attr.normalized);
      }

      // 5. 建立全新幾何體以避免 Three.js 的 GPU 快取和 VAO 衝突問題
      const newGeometry = new THREE.BufferGeometry();
      for (const name in newAttributes) {
        newGeometry.setAttribute(name, newAttributes[name]);
      }
      newGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(remappedIndices), 1));

      newGeometry.computeVertexNormals();
      newGeometry.computeBoundingSphere();
      newGeometry.computeBoundingBox();

      // 釋放舊幾何體，並更新 mesh 引用
      mesh.geometry.dispose();
      mesh.geometry = newGeometry;
    }
  } else {
    // 非索引幾何體 (Fallback / GLTF/OBJ 導入可能沒有索引)
    const posAttr = geometry.attributes.position;
    const vertexCount = posAttr.count;
    const faceCount = vertexCount / 3;
    const deletedFaces = new Set();

    if (state.editSubMode === 'face' && state.selectedFaces.size > 0) {
      for (const faceIdx of state.selectedFaces) {
        deletedFaces.add(faceIdx);
      }
    } else if (state.editSubMode === 'vertex' && state.selectedVertices.size > 0) {
      for (const vertIdx of state.selectedVertices) {
        const faceIdx = Math.floor(vertIdx / 3);
        deletedFaces.add(faceIdx);
      }
    } else if (state.editSubMode === 'edge' && state.selectedEdges.size > 0) {
      for (let f = 0; f < faceCount; f++) {
        const a = f * 3;
        const b = f * 3 + 1;
        const c = f * 3 + 2;
        const edgeAB = a < b ? `${a}-${b}` : `${b}-${a}`;
        const edgeBC = b < c ? `${b}-${c}` : `${c}-${b}`;
        const edgeCA = c < a ? `${c}-${a}` : `${a}-${c}`;
        if (state.selectedEdges.has(edgeAB) || state.selectedEdges.has(edgeBC) || state.selectedEdges.has(edgeCA)) {
          deletedFaces.add(f);
        }
      }
    }

    if (deletedFaces.size > 0) {
      const keptFaceIndices = [];
      for (let f = 0; f < faceCount; f++) {
        if (!deletedFaces.has(f)) {
          keptFaceIndices.push(f);
        }
      }

      const newVertexCount = keptFaceIndices.length * 3;
      const newAttributes = {};

      for (const name in geometry.attributes) {
        const attr = geometry.attributes[name];
        const itemSize = attr.itemSize;
        const oldArray = attr.array;
        const newArray = new oldArray.constructor(newVertexCount * itemSize);

        let targetIdx = 0;
        for (const f of keptFaceIndices) {
          const sourceStart = f * 3 * itemSize;
          for (let j = 0; j < 3 * itemSize; j++) {
            newArray[targetIdx * 3 * itemSize + j] = oldArray[sourceStart + j];
          }
          targetIdx++;
        }
        newAttributes[name] = new THREE.BufferAttribute(newArray, itemSize, attr.normalized);
      }

      const newGeometry = new THREE.BufferGeometry();
      for (const name in newAttributes) {
        newGeometry.setAttribute(name, newAttributes[name]);
      }

      newGeometry.computeVertexNormals();
      newGeometry.computeBoundingSphere();
      newGeometry.computeBoundingBox();

      mesh.geometry.dispose();
      mesh.geometry = newGeometry;
      changed = true;
    }
  }

  if (changed) {
    // Push undo command
    const cmd = new DeleteElementCommand(mesh, geometrySnapshot, positionsSnapshot, editData, gizmoManager);
    state.history.undoStack.push(cmd);
    state.history.redoStack = [];
    state.notifyHistoryChanged();

    // Re-parse geometry and rebuild gizmos
    editData.positions = [];
    editData.edges = [];
    editData.faces = [];
    editData.edgeSet.clear();
    editData.parse();

    gizmoManager.build(editData);

    // Clear selection
    state.selectedVertices.clear();
    state.selectedEdges.clear();
    state.selectedFaces.clear();
    state.notifyEditSelectionChanged();
  }
}

// ---- CREATE FACE FROM SELECTED VERTICES ----
export function createFaceFromSelection() {
  if (!editData || state.editorMode !== 'edit') return;
  if (state.editSubMode !== 'vertex') return;
  if (state.selectedVertices.size < 3) return;

  const mesh = editData.mesh;
  const geometry = mesh.geometry;
  const verts = Array.from(state.selectedVertices);

  // Snapshot for undo
  const geometrySnapshot = geometry.clone();
  const positionsSnapshot = editData.snapshotPositions();

  // For simplicity, take first 3 vertices for a single triangle
  // (for 4+ vertices, could fan-triangulate)
  const newFaces = [];
  if (verts.length === 3) {
    newFaces.push(verts[0], verts[1], verts[2]);
  } else {
    // Fan triangulation from first vertex
    for (let i = 1; i < verts.length - 1; i++) {
      newFaces.push(verts[0], verts[i], verts[i + 1]);
    }
  }

  // Add to index buffer
  const index = geometry.index;
  if (index) {
    const oldIndices = Array.from(index.array);
    const combined = [...oldIndices, ...newFaces];
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(combined), 1));
  } else {
    // Non-indexed geometry — need to add position entries
    // This case is more complex; for now just add index
    const posAttr = geometry.attributes.position;
    const indexArray = [];
    for (let i = 0; i < posAttr.count; i += 3) {
      indexArray.push(i, i + 1, i + 2);
    }
    indexArray.push(...newFaces);
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArray), 1));
  }

  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  // 釋放舊的 WebGL 快取，強制 GPU 重新生成索引緩衝區
  geometry.dispose();

  // Push undo
  const cmd = new AddFaceCommand(mesh, geometrySnapshot, positionsSnapshot, editData, gizmoManager);
  state.history.undoStack.push(cmd);
  state.history.redoStack = [];
  state.notifyHistoryChanged();

  // Re-parse and rebuild
  editData.positions = [];
  editData.edges = [];
  editData.faces = [];
  editData.edgeSet.clear();
  editData.parse();

  gizmoManager.build(editData);
  state.notifyEditSelectionChanged();
}
