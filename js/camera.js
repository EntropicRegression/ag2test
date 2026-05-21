// camera.js - Scene Camera Creation, Helpers, and Interpolation
import * as THREE from 'three';
import { state } from './state.js';

let cameraCount = 0;

/**
 * Creates a scene camera group which contains the actual camera,
 * visual representations (mesh), and holds keyframe data.
 */
export function createSceneCamera() {
  const cameraGroup = new THREE.Group();
  cameraCount++;
  cameraGroup.name = `攝影機 Camera #${cameraCount}`;
  cameraGroup.isSceneCamera = true;
  
  // 1. Actual camera instance
  const camera = new THREE.PerspectiveCamera(60, 1.778, 0.1, 100);
  camera.name = "CameraInstance";
  // Place camera at origin of the group, facing negative Z
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  cameraGroup.add(camera);

  // 2. Camera neon visual representation (body + lens)
  // Base wireframe material matching the selected color
  const bodyColor = new THREE.Color(state.globalColor);
  const camMaterial = new THREE.MeshBasicMaterial({
    color: bodyColor,
    wireframe: true,
    transparent: true,
    opacity: 0.8
  });

  // Box representing camera body
  const bodyGeo = new THREE.BoxGeometry(0.8, 0.6, 1.0);
  const bodyMesh = new THREE.Mesh(bodyGeo, camMaterial);
  bodyMesh.name = "CameraBodyMesh";
  cameraGroup.add(bodyMesh);

  // Cone representing camera lens, pointing -Z
  const lensGeo = new THREE.ConeGeometry(0.4, 0.6, 4);
  lensGeo.rotateX(-Math.PI / 2); // Point forward along negative Z
  const lensMesh = new THREE.Mesh(lensGeo, camMaterial);
  lensMesh.position.set(0, 0, -0.8);
  lensMesh.name = "CameraLensMesh";
  cameraGroup.add(lensMesh);

  // 3. Camera Helper to visualize frustum
  const cameraHelper = new THREE.CameraHelper(camera);
  cameraHelper.name = "CameraHelper";
  // The helper is added to the scene globally, but we link it to the cameraGroup
  cameraHelper.visible = false; // Hidden unless selected
  state.scene.add(cameraHelper);
  cameraGroup.userData.helper = cameraHelper;

  // Auto-manage helper in scene during add/remove (robust undo/redo)
  cameraGroup.addEventListener('added', () => {
    if (cameraGroup.userData.helper && state.scene) {
      if (!state.scene.children.includes(cameraGroup.userData.helper)) {
        state.scene.add(cameraGroup.userData.helper);
      }
    }
  });
  
  cameraGroup.addEventListener('removed', () => {
    if (cameraGroup.userData.helper && state.scene) {
      state.scene.remove(cameraGroup.userData.helper);
    }
  });

  // 4. Set default transform slightly elevated
  cameraGroup.position.set(
    (Math.random() - 0.5) * 4,
    3,
    8 + (Math.random() - 0.5) * 2
  );

  // 5. Initialize animation keyframes in userData
  cameraGroup.userData.keyframes = []; // Sorted array of keyframe objects { time, position, quaternion, fov }

  // Define fov getter/setter to integrate seamlessly with ChangePropertyCommand
  Object.defineProperty(cameraGroup, 'fov', {
    get: () => camera.fov,
    set: (val) => {
      camera.fov = val;
      updateCameraHelper(cameraGroup);
    },
    configurable: true,
    enumerable: true
  });

  return cameraGroup;
}

/**
 * Updates camera helper projection matrix when FOV/Near/Far changes.
 */
export function updateCameraHelper(cameraGroup) {
  if (!cameraGroup || !cameraGroup.isSceneCamera) return;
  const camera = cameraGroup.getObjectByName("CameraInstance");
  const helper = cameraGroup.userData.helper;
  if (camera && helper) {
    camera.updateProjectionMatrix();
    helper.update();
  }
}

/**
 * Destroys helper associated with the camera.
 */
export function destroyCameraHelper(cameraGroup) {
  if (cameraGroup && cameraGroup.userData && cameraGroup.userData.helper) {
    state.scene.remove(cameraGroup.userData.helper);
    cameraGroup.userData.helper.dispose();
    cameraGroup.userData.helper = null;
  }
}

/**
 * Adds a keyframe for the current camera transform at a specific time.
 */
export function addCameraKeyframe(cameraGroup, time) {
  if (!cameraGroup || !cameraGroup.isSceneCamera) return;
  
  const cameraInstance = cameraGroup.getObjectByName("CameraInstance");
  if (!cameraInstance) return;

  const keyframes = cameraGroup.userData.keyframes;
  
  // Clone current values
  const position = cameraGroup.position.clone();
  const quaternion = cameraGroup.quaternion.clone();
  const fov = cameraInstance.fov;

  // Check if a keyframe at this exact time (or very close) already exists
  const existingIndex = keyframes.findIndex(kf => Math.abs(kf.time - time) < 0.01);

  const newKf = { time, position, quaternion, fov };

  if (existingIndex !== -1) {
    keyframes[existingIndex] = newKf;
  } else {
    keyframes.push(newKf);
    // Keep keyframes sorted by time
    keyframes.sort((a, b) => a.time - b.time);
  }

  // Sync timeline markers UI
  state.triggerEvent('cameraChange', cameraGroup);
}

/**
 * Removes a keyframe from the camera at a specific time.
 */
export function removeCameraKeyframe(cameraGroup, time) {
  if (!cameraGroup || !cameraGroup.isSceneCamera) return;
  const keyframes = cameraGroup.userData.keyframes;
  const idx = keyframes.findIndex(kf => Math.abs(kf.time - time) < 0.01);
  if (idx !== -1) {
    keyframes.splice(idx, 1);
    state.triggerEvent('cameraChange', cameraGroup);
    return true;
  }
  return false;
}

/**
 * Clears all keyframes for a camera.
 */
export function clearCameraKeyframes(cameraGroup) {
  if (!cameraGroup || !cameraGroup.isSceneCamera) return;
  cameraGroup.userData.keyframes = [];
  state.triggerEvent('cameraChange', cameraGroup);
}

/**
 * Updates the camera's position, rotation and FOV by interpolating keyframes at a given time.
 */
export function interpolateCamera(cameraGroup, time) {
  if (!cameraGroup || !cameraGroup.isSceneCamera) return;
  const keyframes = cameraGroup.userData.keyframes;
  if (!keyframes || keyframes.length === 0) return;

  const cameraInstance = cameraGroup.getObjectByName("CameraInstance");
  if (!cameraInstance) return;

  // Case 1: Only 1 keyframe
  if (keyframes.length === 1) {
    const kf = keyframes[0];
    cameraGroup.position.copy(kf.position);
    cameraGroup.quaternion.copy(kf.quaternion);
    cameraInstance.fov = kf.fov;
    cameraInstance.updateProjectionMatrix();
    if (cameraGroup.userData.helper) cameraGroup.userData.helper.update();
    return;
  }

  // Case 2: Time is before first keyframe
  if (time <= keyframes[0].time) {
    const kf = keyframes[0];
    cameraGroup.position.copy(kf.position);
    cameraGroup.quaternion.copy(kf.quaternion);
    cameraInstance.fov = kf.fov;
    cameraInstance.updateProjectionMatrix();
    if (cameraGroup.userData.helper) cameraGroup.userData.helper.update();
    return;
  }

  // Case 3: Time is after last keyframe
  if (time >= keyframes[keyframes.length - 1].time) {
    const kf = keyframes[keyframes.length - 1];
    cameraGroup.position.copy(kf.position);
    cameraGroup.quaternion.copy(kf.quaternion);
    cameraInstance.fov = kf.fov;
    cameraInstance.updateProjectionMatrix();
    if (cameraGroup.userData.helper) cameraGroup.userData.helper.update();
    return;
  }

  // Case 4: Interpolate between kfA and kfB
  let kfA = keyframes[0];
  let kfB = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      kfA = keyframes[i];
      kfB = keyframes[i + 1];
      break;
    }
  }

  const rawT = (time - kfA.time) / (kfB.time - kfA.time);
  // Apply a smoothstep ease-in-ease-out curve for highly premium cinematics
  const smoothT = rawT * rawT * (3 - 2 * rawT);

  // Position interpolation
  cameraGroup.position.lerpVectors(kfA.position, kfB.position, smoothT);
  
  // Rotation interpolation (Quaternion Slerp)
  cameraGroup.quaternion.slerpQuaternions(kfA.quaternion, kfB.quaternion, smoothT);

  // FOV interpolation
  cameraInstance.fov = kfA.fov + (kfB.fov - kfA.fov) * smoothT;
  cameraInstance.updateProjectionMatrix();

  cameraGroup.updateMatrixWorld();
  if (cameraGroup.userData.helper) cameraGroup.userData.helper.update();
}
