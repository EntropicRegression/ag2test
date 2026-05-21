// editMode.js - Edit Mode Core Controller
// Manages lifecycle of vertex/edge/face editing on a selected Mesh
import * as THREE from 'three';
import { state } from './state.js';
import { EditGizmoManager } from './editGizmo.js';
import { initEditSelection, disposeEditSelection } from './editSelection.js';
import { initEditTools, disposeEditTools } from './editTools.js';

// Structured geometry data for editing
export class EditableMeshData {
  constructor(mesh) {
    this.mesh = mesh;
    this.positions = [];      // {x, y, z}[] — unique vertex positions
    this.edges = [];          // {v1, v2}[] — unique edges
    this.faces = [];          // {a, b, c}[] — triangle faces (indices into positions)
    this.edgeSet = new Set(); // For dedup: "min-max" key set
    this.parse();
  }

  parse() {
    const geometry = this.mesh.geometry;
    if (!geometry || !geometry.isBufferGeometry) return;

    const posAttr = geometry.attributes.position;
    if (!posAttr) return;

    // Extract all unique vertex positions
    const vertexCount = posAttr.count;
    for (let i = 0; i < vertexCount; i++) {
      this.positions.push({
        x: posAttr.getX(i),
        y: posAttr.getY(i),
        z: posAttr.getZ(i)
      });
    }

    // Extract faces and edges
    const index = geometry.index;

    if (index) {
      // Indexed geometry
      const indexArray = index.array;
      for (let i = 0; i < indexArray.length; i += 3) {
        const a = indexArray[i];
        const b = indexArray[i + 1];
        const c = indexArray[i + 2];
        this.faces.push({ a, b, c, faceIndex: this.faces.length });
        this._addEdge(a, b);
        this._addEdge(b, c);
        this._addEdge(c, a);
      }
    } else {
      // Non-indexed: every 3 vertices form a face
      for (let i = 0; i < vertexCount; i += 3) {
        const a = i;
        const b = i + 1;
        const c = i + 2;
        this.faces.push({ a, b, c, faceIndex: this.faces.length });
        this._addEdge(a, b);
        this._addEdge(b, c);
        this._addEdge(c, a);
      }
    }
  }

  _addEdge(v1, v2) {
    const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
    if (!this.edgeSet.has(key)) {
      this.edgeSet.add(key);
      this.edges.push({ v1, v2, key });
    }
  }

  // Get world-space position of a vertex
  getVertexWorldPos(index) {
    const local = new THREE.Vector3(
      this.positions[index].x,
      this.positions[index].y,
      this.positions[index].z
    );
    return local.applyMatrix4(this.mesh.matrixWorld);
  }

  // Get local position as Vector3
  getVertexLocalPos(index) {
    return new THREE.Vector3(
      this.positions[index].x,
      this.positions[index].y,
      this.positions[index].z
    );
  }

  // Update vertex position in the underlying geometry buffer
  updateVertexPosition(index, localPos) {
    this.positions[index].x = localPos.x;
    this.positions[index].y = localPos.y;
    this.positions[index].z = localPos.z;

    const posAttr = this.mesh.geometry.attributes.position;
    posAttr.setXYZ(index, localPos.x, localPos.y, localPos.z);
    posAttr.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.geometry.computeBoundingBox();
  }

  // Snapshot all vertex positions for undo
  snapshotPositions() {
    return this.positions.map(p => ({ x: p.x, y: p.y, z: p.z }));
  }

  // Restore positions from snapshot
  restorePositions(snapshot) {
    const posAttr = this.mesh.geometry.attributes.position;
    for (let i = 0; i < snapshot.length; i++) {
      this.positions[i] = { ...snapshot[i] };
      posAttr.setXYZ(i, snapshot[i].x, snapshot[i].y, snapshot[i].z);
    }
    posAttr.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.geometry.computeBoundingBox();
  }

  // Clone the geometry for undo snapshots
  cloneGeometry() {
    return this.mesh.geometry.clone();
  }
}

// Singleton references
let editData = null;
let gizmoManager = null;
let gizmoTarget = null;

export function getEditData() {
  return editData;
}

export function getGizmoManager() {
  return gizmoManager;
}

export function getGizmoTarget() {
  return gizmoTarget;
}

// Calculate the world-space geometric center (centroid) of the selected sub-elements
export function calculateSelectionCentroid(editData) {
  if (!editData) return null;

  const centroid = new THREE.Vector3();
  let count = 0;

  if (state.editSubMode === 'vertex' && state.selectedVertices.size > 0) {
    for (const idx of state.selectedVertices) {
      const worldPos = editData.getVertexWorldPos(idx);
      centroid.add(worldPos);
      count++;
    }
  } else if (state.editSubMode === 'edge' && state.selectedEdges.size > 0) {
    // Collect all unique vertex indices from selected edges
    const uniqueVerts = new Set();
    for (const edgeKey of state.selectedEdges) {
      const edge = editData.edges.find(e => e.key === edgeKey);
      if (edge) {
        uniqueVerts.add(edge.v1);
        uniqueVerts.add(edge.v2);
      }
    }
    for (const idx of uniqueVerts) {
      const worldPos = editData.getVertexWorldPos(idx);
      centroid.add(worldPos);
      count++;
    }
  } else if (state.editSubMode === 'face' && state.selectedFaces.size > 0) {
    // Collect all unique vertex indices from selected faces
    const uniqueVerts = new Set();
    for (const faceIdx of state.selectedFaces) {
      const face = editData.faces[faceIdx];
      if (face) {
        uniqueVerts.add(face.a);
        uniqueVerts.add(face.b);
        uniqueVerts.add(face.c);
      }
    }
    for (const idx of uniqueVerts) {
      const worldPos = editData.getVertexWorldPos(idx);
      centroid.add(worldPos);
      count++;
    }
  }

  if (count > 0) {
    centroid.divideScalar(count);
    return centroid;
  }
  return null;
}

// Update the position of the gizmoTarget and attach TransformControls
export function updateEditGizmoTarget() {
  if (!editData || !gizmoTarget) return;

  const centroid = calculateSelectionCentroid(editData);
  if (centroid) {
    gizmoTarget.position.copy(centroid);
    gizmoTarget.rotation.set(0, 0, 0);
    gizmoTarget.scale.set(1, 1, 1);
    gizmoTarget.updateMatrixWorld(true);

    if (state.transformControls) {
      state.transformControls.attach(gizmoTarget);
    }
  } else {
    if (state.transformControls && state.transformControls.object === gizmoTarget) {
      state.transformControls.detach();
    }
  }
}

// Initialize Edit Mode module
export function initEditMode() {
  gizmoManager = new EditGizmoManager();

  // Listen for mode changes
  state.addEventListener('modeChange', (data) => {
    if (data.mode === 'edit') {
      onEnterEditMode(data.mesh);
    } else {
      onExitEditMode();
    }
  });

  // Listen for edit selection changes
  state.addEventListener('editSelection', () => {
    if (state.editorMode === 'edit') {
      updateEditGizmoTarget();
    }
  });
}

function onEnterEditMode(mesh) {
  if (!mesh || !mesh.isMesh || !mesh.geometry) {
    console.warn('[EditMode] Cannot enter edit mode: invalid mesh');
    state.exitEditMode();
    return;
  }

  // Force update matrixWorld to ensure we have the absolute latest positions, rotations and scales in world space
  mesh.updateMatrixWorld(true);

  // Parse geometry data
  editData = new EditableMeshData(mesh);

  console.log(`[EditMode] Entered edit mode on "${mesh.name}": ${editData.positions.length} vertices, ${editData.edges.length} edges, ${editData.faces.length} faces`);

  // Build visual helpers
  gizmoManager.build(editData);

  // Initialize and add gizmoTarget to scene
  if (!gizmoTarget) {
    gizmoTarget = new THREE.Object3D();
    gizmoTarget.name = '__EditGizmoTarget__';
  }
  state.scene.add(gizmoTarget);

  // Activate sub-module event listeners
  initEditSelection(editData, gizmoManager);
  initEditTools(editData, gizmoManager);

  // Initial target update
  updateEditGizmoTarget();
}

function onExitEditMode() {
  console.log('[EditMode] Exited edit mode');

  if (state.transformControls && state.transformControls.object === gizmoTarget) {
    state.transformControls.detach();
  }

  // Dispose visual helpers
  if (gizmoManager) {
    gizmoManager.dispose();
  }

  if (gizmoTarget) {
    state.scene.remove(gizmoTarget);
    gizmoTarget = null;
  }

  // Deactivate sub-module event listeners
  disposeEditSelection();
  disposeEditTools();

  // Robust scene fallback: sweep and destroy any remaining edit-mode specific objects
  if (state.scene) {
    const toRemove = [];
    state.scene.traverse(child => {
      if (child.name === '__EditModeHelpers__' || 
          child.name === '__EditGizmoTarget__' || 
          child.userData.isEditPickHelper) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => {
      if (child.parent) {
        child.parent.remove(child);
      }
      child.traverse(subChild => {
        if (subChild.geometry) subChild.geometry.dispose();
        if (subChild.material) {
          if (Array.isArray(subChild.material)) {
            subChild.material.forEach(m => m.dispose());
          } else {
            subChild.material.dispose();
          }
        }
      });
    });
  }

  editData = null;
}

// Toggle Edit Mode (called from toolbar/keyboard)
export function toggleEditMode() {
  if (state.editorMode === 'edit') {
    state.exitEditMode();
  } else {
    // Need a selected Mesh
    const obj = state.selectedObject;
    if (!obj) return;

    // If it's a Group, try to find a child mesh
    let mesh = null;
    if (obj.isMesh) {
      mesh = obj;
    } else {
      obj.traverse(child => {
        if (!mesh && child.isMesh) {
          mesh = child;
        }
      });
    }

    if (mesh) {
      state.enterEditMode(mesh);
    }
  }
}
