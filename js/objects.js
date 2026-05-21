// objects.js - Object Creation, Deletion, and Manipulation
import * as THREE from 'three';
import { state } from './state.js';
import { AddObjectCommand, RemoveObjectCommand } from './history.js';
import { createSceneCamera, destroyCameraHelper } from './camera.js';

let objectCount = 0;

// Create standard meshes
export function createGeometry(type) {
  let geometry;
  let name = "";
  
  switch(type) {
    case 'box':
      geometry = new THREE.BoxGeometry(2, 2, 2);
      name = "立方體 Cube";
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(1.5, 16, 16);
      name = "球體 Sphere";
      break;
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(1, 1, 3, 16);
      name = "圓柱體 Cylinder";
      break;
    case 'cone':
      geometry = new THREE.ConeGeometry(1, 3, 16);
      name = "圓錐體 Cone";
      break;
    case 'torus':
      geometry = new THREE.TorusGeometry(1.2, 0.4, 8, 24);
      name = "圓環體 Torus";
      break;
    case 'plane':
      geometry = new THREE.PlaneGeometry(3, 3);
      name = "平面 Plane";
      break;
    case 'circle':
      geometry = new THREE.CircleGeometry(1.5, 16);
      name = "圓形 Circle";
      break;
    default:
      return null;
  }

  // Create Wireframe Material with global color
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(state.globalColor),
    wireframe: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  objectCount++;
  mesh.name = `${name} #${objectCount}`;
  
  // Position slightly above grid or randomly
  mesh.position.set(
    (Math.random() - 0.5) * 4,
    1.5,
    (Math.random() - 0.5) * 4
  );

  // Wrap in Add Command
  const cmd = new AddObjectCommand(mesh);
  state.history.execute(cmd);
}

// Create lights and helpers
export function createLight(type) {
  let light;
  let name = "";
  let helper = null;

  switch(type) {
    case 'point-light':
      light = new THREE.PointLight(0xffffff, 2, 50);
      name = "點光源 Point Light";
      // Create helper childed to light so it automatically moves and gets selected
      helper = new THREE.PointLightHelper(light, 0.5, new THREE.Color(state.globalColor));
      helper.name = "LightHelper";
      light.add(helper);
      break;
    case 'dir-light':
      light = new THREE.DirectionalLight(0xffffff, 2);
      name = "平行光 Directional Light";
      helper = new THREE.DirectionalLightHelper(light, 0.8, new THREE.Color(state.globalColor));
      helper.name = "LightHelper";
      light.add(helper);
      break;
    case 'ambient-light':
      light = new THREE.AmbientLight(0xffffff, 0.5);
      name = "環境光 Ambient Light";
      break;
    default:
      return null;
  }

  objectCount++;
  light.name = `${name} #${objectCount}`;
  light.position.set(
    (Math.random() - 0.5) * 4,
    4,
    (Math.random() - 0.5) * 4
  );

  // Wrap in Add Command
  const cmd = new AddObjectCommand(light);
  state.history.execute(cmd);
}

// Create empty group
export function createEmptyGroup() {
  const group = new THREE.Group();
  objectCount++;
  group.name = `空群組 Group #${objectCount}`;
  group.position.set(0, 0, 0);

  const cmd = new AddObjectCommand(group);
  state.history.execute(cmd);
}

// Create scene camera group
export function createCamera() {
  const cameraGroup = createSceneCamera();
  const cmd = new AddObjectCommand(cameraGroup);
  state.history.execute(cmd);
}

// Delete Selected Object
export function deleteSelectedObject() {
  const obj = state.selectedObject;
  if (!obj) return;

  // Protect system scene, grid, and camera from deletion
  if (obj === state.scene || obj.isGridHelper || obj.isAxesHelper) return;

  // If deleting the active viewport camera, revert to editor camera
  if (obj.isSceneCamera) {
    const camInstance = obj.getObjectByName("CameraInstance");
    if (camInstance && state.activeViewportCamera === camInstance) {
      state.setActiveViewportCamera(state.camera);
    }
    // Destroy helper when permanently deleting from memory (Command handles standard hide)
    destroyCameraHelper(obj);
  }

  const cmd = new RemoveObjectCommand(obj);
  state.history.execute(cmd);
}

// Focus camera on object
export function focusCameraOnObject(obj) {
  if (!obj) return;
  
  // Calculate bounding box if mesh
  const box = new THREE.Box3();
  box.setFromObject(obj);
  
  const center = new THREE.Vector3();
  box.getCenter(center);
  
  const size = new THREE.Vector3();
  box.getSize(size);
  
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = state.camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  
  cameraZ *= 2.5; // Zoom out a little
  
  // Animate/set camera position
  if (state.orbitControls) {
    state.orbitControls.target.copy(center);
    state.camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
    state.orbitControls.update();
  }
}
