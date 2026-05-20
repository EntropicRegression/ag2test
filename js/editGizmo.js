// editGizmo.js - Visual Helpers for Edit Mode (Vertex dots, Edge lines, Face overlays)
import * as THREE from 'three';
import { state } from './state.js';

// Colors
const VERTEX_COLOR_DEFAULT = new THREE.Color(0.85, 0.85, 0.95);
const VERTEX_COLOR_SELECTED = new THREE.Color(1.0, 0.55, 0.1);
const EDGE_COLOR_DEFAULT = new THREE.Color(0.25, 0.35, 0.5);
const EDGE_COLOR_SELECTED = new THREE.Color(1.0, 0.55, 0.1);
const FACE_COLOR_SELECTED = new THREE.Color(1.0, 0.45, 0.1);

const VERTEX_SIZE = 6.0;
const VERTEX_SIZE_SELECTED = 9.0;

export class EditGizmoManager {
  constructor() {
    this.vertexPoints = null;       // THREE.Points for vertices
    this.edgeLines = null;          // THREE.LineSegments for edges
    this.faceOverlayMesh = null;    // THREE.Mesh for face highlighting
    this.helperGroup = null;        // Container group
    this.selectedEdgeGroup = null;  // THREE.Group for thick selected edge cylinders
    this.editData = null;

    // Vertex picking spheres (invisible, for raycaster)
    this.vertexPickSpheres = [];
    this.edgePickLines = [];
  }

  build(editData) {
    this.dispose(); // Clear previous
    this.editData = editData;

    this.helperGroup = new THREE.Group();
    this.helperGroup.name = '__EditModeHelpers__';
    this.helperGroup.renderOrder = 999;

    this.selectedEdgeGroup = new THREE.Group();
    this.helperGroup.add(this.selectedEdgeGroup);

    this._buildVertexPoints();
    this._buildEdgeLines();
    this._buildFaceOverlay();
    this._buildPickHelpers();

    // Add to scene (not to the mesh, so they stay in world space)
    state.scene.add(this.helperGroup);

    // Update visibility based on current sub-mode
    this.updateSubModeVisibility();
  }

  dispose() {
    if (this.helperGroup) {
      state.scene.remove(this.helperGroup);

      this.helperGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });

      this.helperGroup = null;
    }

    this.vertexPoints = null;
    this.edgeLines = null;
    this.faceOverlayMesh = null;
    this.selectedEdgeGroup = null;
    this.vertexPickSpheres = [];
    this.edgePickLines = [];
    this.editData = null;
  }

  // ---- BUILD METHODS ----

  _buildVertexPoints() {
    const positions = this.editData.positions;
    const count = positions.length;
    const mesh = this.editData.mesh;

    // Position buffer (world space)
    const posArray = new Float32Array(count * 3);
    const colorArray = new Float32Array(count * 3);
    const sizeArray = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const worldPos = this.editData.getVertexWorldPos(i);
      posArray[i * 3] = worldPos.x;
      posArray[i * 3 + 1] = worldPos.y;
      posArray[i * 3 + 2] = worldPos.z;

      colorArray[i * 3] = VERTEX_COLOR_DEFAULT.r;
      colorArray[i * 3 + 1] = VERTEX_COLOR_DEFAULT.g;
      colorArray[i * 3 + 2] = VERTEX_COLOR_DEFAULT.b;

      sizeArray[i] = VERTEX_SIZE;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizeArray, 1));

    const material = new THREE.PointsMaterial({
      size: VERTEX_SIZE,
      vertexColors: true,
      sizeAttenuation: false,
      depthTest: false,
      transparent: true,
      opacity: 0.9
    });

    this.vertexPoints = new THREE.Points(geometry, material);
    this.vertexPoints.renderOrder = 1000;
    this.helperGroup.add(this.vertexPoints);
  }

  _buildEdgeLines() {
    const edges = this.editData.edges;
    const count = edges.length;

    const posArray = new Float32Array(count * 6); // 2 vertices per edge, 3 components
    const colorArray = new Float32Array(count * 6);

    for (let i = 0; i < count; i++) {
      const edge = edges[i];
      const p1 = this.editData.getVertexWorldPos(edge.v1);
      const p2 = this.editData.getVertexWorldPos(edge.v2);

      posArray[i * 6] = p1.x;
      posArray[i * 6 + 1] = p1.y;
      posArray[i * 6 + 2] = p1.z;
      posArray[i * 6 + 3] = p2.x;
      posArray[i * 6 + 4] = p2.y;
      posArray[i * 6 + 5] = p2.z;

      // Default color
      for (let c = 0; c < 6; c++) {
        colorArray[i * 6 + c] = c % 3 === 0 ? EDGE_COLOR_DEFAULT.r
          : c % 3 === 1 ? EDGE_COLOR_DEFAULT.g
          : EDGE_COLOR_DEFAULT.b;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.7,
      linewidth: 1
    });

    this.edgeLines = new THREE.LineSegments(geometry, material);
    this.edgeLines.renderOrder = 999;
    this.helperGroup.add(this.edgeLines);
  }

  _buildFaceOverlay() {
    // Clone mesh geometry and convert to non-indexed for independent face highlighting
    const mesh = this.editData.mesh;
    const geomClone = mesh.geometry.toNonIndexed();

    // Create per-face vertex color (for highlight)
    const vertCount = geomClone.attributes.position.count;
    const colorArray = new Float32Array(vertCount * 3);
    geomClone.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthTest: false
    });

    this.faceOverlayMesh = new THREE.Mesh(geomClone, material);
    this.faceOverlayMesh.renderOrder = 998;

    // Copy world transform from target mesh
    this.faceOverlayMesh.matrixAutoUpdate = false;
    this.faceOverlayMesh.matrix.copy(mesh.matrixWorld);
    this.faceOverlayMesh.matrixWorld.copy(mesh.matrixWorld);

    this.helperGroup.add(this.faceOverlayMesh);
  }

  _buildPickHelpers() {
    // Transparent spheres at each vertex for raycaster picking
    // Must be visible=true for raycaster to hit, but visually invisible via transparent material
    this.vertexPickSpheres = [];
    const sphereGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const sphereMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < this.editData.positions.length; i++) {
      const worldPos = this.editData.getVertexWorldPos(i);
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.copy(worldPos);
      sphere.userData.vertexIndex = i;
      sphere.userData.isEditPickHelper = true;
      sphere.renderOrder = 1001;
      this.helperGroup.add(sphere);
      this.vertexPickSpheres.push(sphere);
    }
  }

  // ---- UPDATE METHODS ----

  updateSubModeVisibility() {
    const mode = state.editSubMode;
    if (this.vertexPoints) {
      this.vertexPoints.visible = (mode === 'vertex' || mode === 'edge');
    }
    if (this.edgeLines) {
      this.edgeLines.visible = (mode === 'edge');
    }
    if (this.selectedEdgeGroup) {
      this.selectedEdgeGroup.visible = (mode === 'edge');
    }
    if (this.faceOverlayMesh) {
      this.faceOverlayMesh.visible = (mode === 'face');
      this.faceOverlayMesh.material.opacity = (mode === 'face') ? 0.35 : 0.0;
    }

    // Pick spheres: visible=true for raycaster, but only needed in vertex mode
    this.vertexPickSpheres.forEach(s => {
      s.visible = (mode === 'vertex'); // Only active in vertex mode
    });
  }

  // Update vertex highlight colors based on selection
  updateVertexHighlight(selectedSet) {
    if (!this.vertexPoints) return;

    const colorAttr = this.vertexPoints.geometry.attributes.color;
    const count = this.editData.positions.length;
    const mode = state.editSubMode;

    if (mode === 'vertex') {
      for (let i = 0; i < count; i++) {
        const isSelected = selectedSet.has(i);
        const color = isSelected ? VERTEX_COLOR_SELECTED : VERTEX_COLOR_DEFAULT;
        colorAttr.setXYZ(i, color.r, color.g, color.b);
      }
    } else if (mode === 'edge') {
      // In edge mode, highlight endpoints of selected edges
      const activeVerts = new Set();
      for (const edgeKey of state.selectedEdges) {
        const edge = this.editData.edges.find(e => e.key === edgeKey);
        if (edge) {
          activeVerts.add(edge.v1);
          activeVerts.add(edge.v2);
        }
      }
      for (let i = 0; i < count; i++) {
        const isSelected = activeVerts.has(i);
        const color = isSelected ? VERTEX_COLOR_SELECTED : VERTEX_COLOR_DEFAULT;
        colorAttr.setXYZ(i, color.r, color.g, color.b);
      }
    } else {
      for (let i = 0; i < count; i++) {
        colorAttr.setXYZ(i, VERTEX_COLOR_DEFAULT.r, VERTEX_COLOR_DEFAULT.g, VERTEX_COLOR_DEFAULT.b);
      }
    }
    colorAttr.needsUpdate = true;

    // Update point size
    const size = (mode === 'vertex' && selectedSet.size > 0) || (mode === 'edge' && state.selectedEdges.size > 0)
      ? VERTEX_SIZE_SELECTED : VERTEX_SIZE;
    this.vertexPoints.material.size = size;
  }

  // Update edge highlight colors
  updateEdgeHighlight(selectedSet) {
    if (!this.edgeLines) return;

    const colorAttr = this.edgeLines.geometry.attributes.color;
    const edges = this.editData.edges;

    for (let i = 0; i < edges.length; i++) {
      const isSelected = selectedSet.has(edges[i].key);
      const color = isSelected ? EDGE_COLOR_SELECTED : EDGE_COLOR_DEFAULT;
      colorAttr.setXYZ(i * 2, color.r, color.g, color.b);
      colorAttr.setXYZ(i * 2 + 1, color.r, color.g, color.b);
    }
    colorAttr.needsUpdate = true;

    // 清除舊的選中邊線粗體高亮網格
    if (this.selectedEdgeGroup) {
      while (this.selectedEdgeGroup.children.length > 0) {
        const child = this.selectedEdgeGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        this.selectedEdgeGroup.remove(child);
      }

      // 為所有選中的邊建立粗體橘色圓柱高亮 (Cylinder highlights)
      const cylGeoCache = {};
      const cylMat = new THREE.MeshBasicMaterial({
        color: EDGE_COLOR_SELECTED,
        depthTest: false,
        transparent: true,
        opacity: 0.8
      });

      for (const edgeKey of selectedSet) {
        const edge = this.editData.edges.find(e => e.key === edgeKey);
        if (edge) {
          const p1 = this.editData.getVertexWorldPos(edge.v1);
          const p2 = this.editData.getVertexWorldPos(edge.v2);

          const direction = new THREE.Vector3().subVectors(p2, p1);
          const length = direction.length();
          if (length < 1e-4) continue;

          // 四捨五入長度以快取和重複使用 Geometry 提升效能
          const lengthKey = length.toFixed(3);
          if (!cylGeoCache[lengthKey]) {
            // 半徑 0.035 形成合適的橘色粗線條標示
            cylGeoCache[lengthKey] = new THREE.CylinderGeometry(0.035, 0.035, length, 6);
          }
          const geo = cylGeoCache[lengthKey];
          const cylinder = new THREE.Mesh(geo, cylMat);
          cylinder.renderOrder = 1000;

          // 放置於兩端點中點
          cylinder.position.copy(p1).addScaledVector(direction, 0.5);

          // 旋轉對齊邊的方向 (預設 Cylinder 是 Y 軸朝上)
          const up = new THREE.Vector3(0, 1, 0);
          const dirNormalized = direction.clone().normalize();
          cylinder.quaternion.setFromUnitVectors(up, dirNormalized);

          this.selectedEdgeGroup.add(cylinder);
        }
      }
    }

    // Automatically update vertex endpoints highlight in edge mode
    this.updateVertexHighlight(state.selectedVertices);
  }

  // Update face highlight
  updateFaceHighlight(selectedSet) {
    if (!this.faceOverlayMesh) return;

    const colorAttr = this.faceOverlayMesh.geometry.attributes.color;
    if (!colorAttr) return;

    // Reset all colors to black (no highlight)
    const vertCount = colorAttr.count;
    for (let i = 0; i < vertCount; i++) {
      colorAttr.setXYZ(i, 0, 0, 0);
    }

    // Highlight selected faces
    for (const faceIdx of selectedSet) {
      const vertA = faceIdx * 3;
      const vertB = faceIdx * 3 + 1;
      const vertC = faceIdx * 3 + 2;

      if (vertC < vertCount) {
        colorAttr.setXYZ(vertA, FACE_COLOR_SELECTED.r, FACE_COLOR_SELECTED.g, FACE_COLOR_SELECTED.b);
        colorAttr.setXYZ(vertB, FACE_COLOR_SELECTED.r, FACE_COLOR_SELECTED.g, FACE_COLOR_SELECTED.b);
        colorAttr.setXYZ(vertC, FACE_COLOR_SELECTED.r, FACE_COLOR_SELECTED.g, FACE_COLOR_SELECTED.b);
      }
    }

    colorAttr.needsUpdate = true;
    this.faceOverlayMesh.material.opacity = selectedSet.size > 0 ? 0.45 : 0.0;
  }

  // Refresh all world positions (after vertex move etc.)
  refreshPositions() {
    if (!this.editData) return;

    // Refresh vertex points
    if (this.vertexPoints) {
      const posAttr = this.vertexPoints.geometry.attributes.position;
      for (let i = 0; i < this.editData.positions.length; i++) {
        const wp = this.editData.getVertexWorldPos(i);
        posAttr.setXYZ(i, wp.x, wp.y, wp.z);
      }
      posAttr.needsUpdate = true;
    }

    // Refresh edge lines
    if (this.edgeLines) {
      const posAttr = this.edgeLines.geometry.attributes.position;
      const edges = this.editData.edges;
      for (let i = 0; i < edges.length; i++) {
        const p1 = this.editData.getVertexWorldPos(edges[i].v1);
        const p2 = this.editData.getVertexWorldPos(edges[i].v2);
        posAttr.setXYZ(i * 2, p1.x, p1.y, p1.z);
        posAttr.setXYZ(i * 2 + 1, p2.x, p2.y, p2.z);
      }
      posAttr.needsUpdate = true;
    }

    // Refresh vertex pick spheres
    for (let i = 0; i < this.vertexPickSpheres.length; i++) {
      const wp = this.editData.getVertexWorldPos(i);
      this.vertexPickSpheres[i].position.copy(wp);
    }

    // Refresh face overlay matrix
    if (this.faceOverlayMesh) {
      this.faceOverlayMesh.matrix.copy(this.editData.mesh.matrixWorld);
      this.faceOverlayMesh.matrixWorld.copy(this.editData.mesh.matrixWorld);

      // Also update the geometry positions from source
      const dstPosAttr = this.faceOverlayMesh.geometry.attributes.position;
      const faces = this.editData.faces;
      for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const pA = this.editData.getVertexLocalPos(face.a);
        const pB = this.editData.getVertexLocalPos(face.b);
        const pC = this.editData.getVertexLocalPos(face.c);

        dstPosAttr.setXYZ(i * 3, pA.x, pA.y, pA.z);
        dstPosAttr.setXYZ(i * 3 + 1, pB.x, pB.y, pB.z);
        dstPosAttr.setXYZ(i * 3 + 2, pC.x, pC.y, pC.z);
      }
      dstPosAttr.needsUpdate = true;
    }

    // 當處於邊線子模式時，動態更新選中邊線的圓柱網格位置與長度
    if (state.editSubMode === 'edge') {
      this.updateEdgeHighlight(state.selectedEdges);
    }
  }
}
