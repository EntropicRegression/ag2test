// editMode.js - Edit Mode Core Controller
// Manages lifecycle of vertex/edge/face editing on a selected Mesh
import * as THREE from 'three';
import { state } from './state.js';
import { EditGizmoManager } from './editGizmo.js';
import { initEditSelection, disposeEditSelection } from './editSelection.js';
import { initEditTools, disposeEditTools } from './editTools.js';

// Helper to merge two triangles sharing an edge into a quad sequence
function mergeTrianglesToQuad(t1, t2, positions, vertexToGroupIndex = null, useSpatial = false) {
  const shared = [];
  const unshared1 = [];
  const unshared2 = [];

  const getUniqueId = (idx) => {
    if (useSpatial && vertexToGroupIndex && vertexToGroupIndex[idx] !== undefined) {
      return vertexToGroupIndex[idx];
    }
    const p = positions[idx];
    if (!p) return `${idx}`;
    return `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
  };

  const t1Keys = useSpatial ? t1.map(idx => getUniqueId(idx)) : t1;
  const t2Keys = useSpatial ? t2.map(idx => getUniqueId(idx)) : t2;

  for (let i = 0; i < 3; i++) {
    if (t2Keys.includes(t1Keys[i])) {
      shared.push(t1[i]);
    } else {
      unshared1.push(t1[i]);
    }
  }

  for (let i = 0; i < 3; i++) {
    if (!t1Keys.includes(t2Keys[i])) {
      unshared2.push(t2[i]);
    }
  }

  if (shared.length !== 2 || unshared1.length !== 1 || unshared2.length !== 1) {
    return null;
  }

  const s1 = shared[0];
  const s2 = shared[1];
  const u1 = unshared1[0];
  const u2 = unshared2[0];

  const u1Idx = t1.indexOf(u1);
  const sA = t1[(u1Idx + 1) % 3];
  const sB = t1[(u1Idx + 2) % 3];

  return { a: sB, b: u1, c: sA, d: u2 };
}

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
    this.positions = [];
    for (let i = 0; i < vertexCount; i++) {
      this.positions.push({
        x: posAttr.getX(i),
        y: posAttr.getY(i),
        z: posAttr.getZ(i)
      });
    }

    // 1. Group spatially coincident vertices first
    this.vertexGroups = [];
    this.vertexToGroup = new Array(vertexCount);
    this.vertexToGroupIndex = new Array(vertexCount); // Maps vertex index to group index
    for (let i = 0; i < vertexCount; i++) {
      if (this.vertexToGroup[i] !== undefined) continue;
      const p1 = this.positions[i];
      const group = [i];
      const groupIdx = this.vertexGroups.length;
      for (let j = i + 1; j < vertexCount; j++) {
        const p2 = this.positions[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 1e-8) {
          group.push(j);
        }
      }
      this.vertexGroups.push(group);
      group.forEach(idx => {
        this.vertexToGroup[idx] = group;
        this.vertexToGroupIndex[idx] = groupIdx;
      });
    }

    // 2. Extract all raw triangles
    const index = geometry.index;
    const triangles = [];
    
    if (index) {
      const indexArray = index.array;
      for (let i = 0; i < indexArray.length; i += 3) {
        triangles.push({
          a: indexArray[i],
          b: indexArray[i + 1],
          c: indexArray[i + 2],
          triIndex: i / 3
        });
      }
    } else {
      for (let i = 0; i < vertexCount; i += 3) {
        triangles.push({
          a: i,
          b: i + 1,
          c: i + 2,
          triIndex: i / 3
        });
      }
    }

    // Calculate normal for each triangle in local space
    const normals = triangles.map(tri => {
      const pA = this.getVertexLocalPos(tri.a);
      const pB = this.getVertexLocalPos(tri.b);
      const pC = this.getVertexLocalPos(tri.c);
      const u = new THREE.Vector3().subVectors(pB, pA);
      const v = new THREE.Vector3().subVectors(pC, pA);
      return new THREE.Vector3().crossVectors(u, v).normalize();
    });

    // Helper to get spatial edge key
    const getSpatialEdgeKey = (v1, v2) => {
      const g1 = this.vertexToGroupIndex[v1];
      const g2 = this.vertexToGroupIndex[v2];
      return g1 < g2 ? `${g1}-${g2}` : `${g2}-${g1}`;
    };

    // Index spatial edges to find adjacent triangles: map spatialEdgeKey -> array of triangle indices
    const edgeToTriangles = new Map();
    triangles.forEach((tri, idx) => {
      const e1 = getSpatialEdgeKey(tri.a, tri.b);
      const e2 = getSpatialEdgeKey(tri.b, tri.c);
      const e3 = getSpatialEdgeKey(tri.c, tri.a);

      [e1, e2, e3].forEach(edgeKey => {
        if (!edgeToTriangles.has(edgeKey)) {
          edgeToTriangles.set(edgeKey, []);
        }
        edgeToTriangles.get(edgeKey).push(idx);
      });
    });

    const paired = new Set();
    const quads = [];

    // Pass 1: Try to pair any consecutive triangles (i, i+1) that share an edge and are reasonably coplanar
    for (let i = 0; i < triangles.length - 1; i++) {
      if (paired.has(i) || paired.has(i + 1)) continue;

      const tri1 = triangles[i];
      const tri2 = triangles[i + 1];
      const n1 = normals[i];
      const n2 = normals[i + 1];

      const dot = n1.dot(n2);
      // Only pair consecutive triangles if they are reasonably coplanar (dot > 0.4)
      // to avoid pairing cap triangles with side quads, preventing index shift propagation.
      if (!isNaN(dot) && Math.abs(dot) > 0.4) {
        // Try to merge index-wise first, then spatial-wise
        let merged = mergeTrianglesToQuad([tri1.a, tri1.b, tri1.c], [tri2.a, tri2.b, tri2.c], this.positions, this.vertexToGroupIndex, false);
        if (!merged) {
          merged = mergeTrianglesToQuad([tri1.a, tri1.b, tri1.c], [tri2.a, tri2.b, tri2.c], this.positions, this.vertexToGroupIndex, true);
        }

        if (merged) {
          quads.push({
            a: merged.a,
            b: merged.b,
            c: merged.c,
            d: merged.d,
            triIndices: [tri1.triIndex, tri2.triIndex],
            faceIndex: quads.length
          });
          paired.add(i);
          paired.add(i + 1);
          i++; // Skip the next index since we paired it
        }
      }
    }

    // Pass 2: Greedy spatial-based pairing for remaining unpaired adjacent coplanar triangles
    for (const [edgeKey, triIdxs] of edgeToTriangles.entries()) {
      const unpairedInEdge = triIdxs.filter(idx => !paired.has(idx));
      // ONLY pair if exactly two unpaired triangles share this edge (indicating the diagonal of a quad)
      if (unpairedInEdge.length === 2) {
        const t1Idx = unpairedInEdge[0];
        const t2Idx = unpairedInEdge[1];

        const tri1 = triangles[t1Idx];
        const tri2 = triangles[t2Idx];
        const n1 = normals[t1Idx];
        const n2 = normals[t2Idx];

        // Stricter coplanarity check (> 0.4) to prevent pairing across distinct faces (e.g. sharp 90 deg corners)
        if (Math.abs(n1.dot(n2)) > 0.4) {
          let merged = mergeTrianglesToQuad([tri1.a, tri1.b, tri1.c], [tri2.a, tri2.b, tri2.c], this.positions, this.vertexToGroupIndex, false);
          if (!merged) {
            merged = mergeTrianglesToQuad([tri1.a, tri1.b, tri1.c], [tri2.a, tri2.b, tri2.c], this.positions, this.vertexToGroupIndex, true);
          }

          if (merged) {
            quads.push({
              a: merged.a,
              b: merged.b,
              c: merged.c,
              d: merged.d,
              triIndices: [tri1.triIndex, tri2.triIndex],
              faceIndex: quads.length
            });
            paired.add(t1Idx);
            paired.add(t2Idx);
          }
        }
      }
    }

    // Add remaining unpaired triangles as degenerate quads (d = c)
    triangles.forEach((tri, idx) => {
      if (!paired.has(idx)) {
        quads.push({
          a: tri.a,
          b: tri.b,
          c: tri.c,
          d: tri.c,
          triIndices: [tri.triIndex],
          faceIndex: quads.length
        });
      }
    });

    this.faces = quads;

    // Extract boundary/unique edges
    this.edges = [];
    this.edgeSet.clear();

    this.faces.forEach(face => {
      if (face.d !== face.c) {
        this._addEdge(face.a, face.b);
        this._addEdge(face.b, face.c);
        this._addEdge(face.c, face.d);
        this._addEdge(face.d, face.a);
      } else {
        this._addEdge(face.a, face.b);
        this._addEdge(face.b, face.c);
        this._addEdge(face.c, face.a);
      }
    });
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
    const siblings = this.vertexToGroup ? (this.vertexToGroup[index] || [index]) : [index];
    const posAttr = this.mesh.geometry.attributes.position;

    siblings.forEach(sibIdx => {
      if (this.positions[sibIdx]) {
        this.positions[sibIdx].x = localPos.x;
        this.positions[sibIdx].y = localPos.y;
        this.positions[sibIdx].z = localPos.z;
      }
      posAttr.setXYZ(sibIdx, localPos.x, localPos.y, localPos.z);
    });

    posAttr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
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
    this.mesh.geometry.computeVertexNormals();
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
        if (face.d !== undefined && face.d !== null && face.d !== face.c) {
          uniqueVerts.add(face.d);
        }
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

  // Save original material and swap with temporary edit material
  mesh.userData.originalMaterial = mesh.material;
  mesh.material = new THREE.MeshBasicMaterial({
    color: mesh.userData.originalMaterial.color,
    wireframe: false,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide
  });

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

  // Restore mesh original material
  if (editData && editData.mesh) {
    const mesh = editData.mesh;
    if (mesh.userData.originalMaterial) {
      const tempMaterial = mesh.material;
      mesh.material = mesh.userData.originalMaterial;
      tempMaterial.dispose();
      delete mesh.userData.originalMaterial;
    }
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
