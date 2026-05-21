// animation.js - Unified Animation Solver, Multi-Track Interpolation, and Keyframe Manager
import { state } from './state.js';

/**
 * Solves for cubic Bezier parameter u in [0, 1] given a target time t
 * using high-precision Binary Search (20 iterations).
 * Formula: Bx(u) = (1-u)^3*t1 + 3*(1-u)^2*u*cp1x + 3*(1-u)*u^2*cp2x + u^3*t2
 */
export function solveBezierU(t, t1, cp1x, cp2x, t2) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i++) {
    const u = (low + high) / 2;
    const bu = (1 - u) * (1 - u) * (1 - u) * t1 +
               3 * (1 - u) * (1 - u) * u * cp1x +
               3 * (1 - u) * u * u * cp2x +
               u * u * u * t2;
    if (bu < t) {
      low = u;
    } else {
      high = u;
    }
  }
  return (low + high) / 2;
}

/**
 * Evaluates cubic Bezier value at parameter u.
 * Formula: By(u) = (1-u)^3*v1 + 3*(1-u)^2*u*cp1y + 3*(1-u)*u^2*cp2y + u^3*v2
 */
export function evaluateBezierY(u, v1, cp1y, cp2y, v2) {
  return (1 - u) * (1 - u) * (1 - u) * v1 +
         3 * (1 - u) * (1 - u) * u * cp1y +
         3 * (1 - u) * u * u * cp2y +
         u * u * u * v2;
}

/**
 * Evaluates a property track at a given time using cubic Bezier curve interpolation.
 */
export function evaluateTrack(keyframes, time) {
  if (!keyframes || keyframes.length === 0) return null;
  if (keyframes.length === 1) return keyframes[0].value;

  // Clamp left
  if (time <= keyframes[0].time) return keyframes[0].value;
  // Clamp right
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  // Find surrounding keyframes
  let kfA = keyframes[0];
  let kfB = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      kfA = keyframes[i];
      kfB = keyframes[i + 1];
      break;
    }
  }

  const t1 = kfA.time;
  const v1 = kfA.value;
  const t2 = kfB.time;
  const v2 = kfB.value;

  const duration = t2 - t1;
  const rightHandle = kfA.rightHandle;
  const leftHandle = kfB.leftHandle;

  // Initialize handles with default 1/3 duration tangents if missing or partially missing
  const rTimeOffset = (rightHandle && rightHandle.timeOffset !== undefined) ? rightHandle.timeOffset : duration / 3;
  const rValOffset = (rightHandle && rightHandle.valueOffset !== undefined) ? rightHandle.valueOffset : 0;
  
  const lTimeOffset = (leftHandle && leftHandle.timeOffset !== undefined) ? leftHandle.timeOffset : -duration / 3;
  const lValOffset = (leftHandle && leftHandle.valueOffset !== undefined) ? leftHandle.valueOffset : 0;

  // Clamp handle time offsets to ensure they reside strictly within the interval [t1, t2] to prevent non-monotonic curves
  const clampedRTimeOffset = Math.max(0, Math.min(duration, rTimeOffset));
  const clampedLTimeOffset = Math.min(0, Math.max(-duration, lTimeOffset));

  const cp1x = t1 + clampedRTimeOffset;
  const cp1y = v1 + rValOffset;
  const cp2x = t2 + clampedLTimeOffset;
  const cp2y = v2 + lValOffset;

  // Solve Bezier parameter u and get value
  const u = solveBezierU(time, t1, cp1x, cp2x, t2);
  return evaluateBezierY(u, v1, cp1y, cp2y, v2);
}

/**
 * Interpolates all property animation tracks on a target object at a specific time.
 */
export function interpolateObject(object, time) {
  if (!object || !object.userData || !object.userData.animationTracks) return;

  const tracks = object.userData.animationTracks;
  let didUpdate = false;

  // 1. Position X, Y, Z
  if (tracks['position.x'] !== undefined) {
    const val = evaluateTrack(tracks['position.x'], time);
    if (val !== null) { object.position.x = val; didUpdate = true; }
  }
  if (tracks['position.y'] !== undefined) {
    const val = evaluateTrack(tracks['position.y'], time);
    if (val !== null) { object.position.y = val; didUpdate = true; }
  }
  if (tracks['position.z'] !== undefined) {
    const val = evaluateTrack(tracks['position.z'], time);
    if (val !== null) { object.position.z = val; didUpdate = true; }
  }

  // 2. Rotation X, Y, Z (stored as Euler angle degrees, convert to radians)
  if (tracks['rotation.x'] !== undefined) {
    const val = evaluateTrack(tracks['rotation.x'], time);
    if (val !== null) { object.rotation.x = val * (Math.PI / 180); didUpdate = true; }
  }
  if (tracks['rotation.y'] !== undefined) {
    const val = evaluateTrack(tracks['rotation.y'], time);
    if (val !== null) { object.rotation.y = val * (Math.PI / 180); didUpdate = true; }
  }
  if (tracks['rotation.z'] !== undefined) {
    const val = evaluateTrack(tracks['rotation.z'], time);
    if (val !== null) { object.rotation.z = val * (Math.PI / 180); didUpdate = true; }
  }

  // 3. Scale X, Y, Z
  if (tracks['scale.x'] !== undefined) {
    const val = evaluateTrack(tracks['scale.x'], time);
    if (val !== null) { object.scale.x = val; didUpdate = true; }
  }
  if (tracks['scale.y'] !== undefined) {
    const val = evaluateTrack(tracks['scale.y'], time);
    if (val !== null) { object.scale.y = val; didUpdate = true; }
  }
  if (tracks['scale.z'] !== undefined) {
    const val = evaluateTrack(tracks['scale.z'], time);
    if (val !== null) { object.scale.z = val; didUpdate = true; }
  }

  // 4. FOV (if camera)
  if (tracks['fov'] !== undefined && object.isSceneCamera) {
    const val = evaluateTrack(tracks['fov'], time);
    if (val !== null) {
      object.fov = val; // uses fov setter to update projection & helper
      didUpdate = true;
    }
  }

  // 5. Intensity (if light)
  if (tracks['intensity'] !== undefined && object.isLight) {
    const val = evaluateTrack(tracks['intensity'], time);
    if (val !== null) { object.intensity = val; didUpdate = true; }
  }

  // 6. Material Wireframe Color (R, G, B channels in [0, 1])
  let hasColorR = tracks['color.r'] !== undefined;
  let hasColorG = tracks['color.g'] !== undefined;
  let hasColorB = tracks['color.b'] !== undefined;

  if (hasColorR || hasColorG || hasColorB) {
    let r = 1.0, g = 1.0, b = 1.0;
    
    // Find initial color from meshes if track values are missing
    let defaultColor = { r: 1.0, g: 1.0, b: 1.0 };
    object.traverse(child => {
      if (child.isMesh && child.material && child.material.color) {
        defaultColor = child.material.color;
      }
    });

    r = hasColorR ? evaluateTrack(tracks['color.r'], time) : defaultColor.r;
    g = hasColorG ? evaluateTrack(tracks['color.g'], time) : defaultColor.g;
    b = hasColorB ? evaluateTrack(tracks['color.b'], time) : defaultColor.b;

    object.traverse(child => {
      if (child.isMesh && child.material && child.material.color) {
        child.material.color.setRGB(r, g, b);
      }
    });
  }

  if (didUpdate) {
    object.updateMatrixWorld();
    
    // If it's a camera, sync projection matrix and internal CameraInstance
    if (object.isSceneCamera) {
      const cameraInstance = object.getObjectByName("CameraInstance");
      const helper = object.userData.helper;
      if (cameraInstance) {
        cameraInstance.fov = object.fov;
        cameraInstance.updateProjectionMatrix();
      }
      if (helper) {
        helper.update();
      }
    }
  }
}

/**
 * Inserts a keyframe on a specific track of an object at time t, with default flat tangents.
 */
export function insertObjectKeyframe(object, trackName, time, value) {
  if (!object || !object.userData) return;

  // Initialize tracks if missing
  if (!object.userData.animationTracks) {
    object.userData.animationTracks = {};
  }

  const tracks = object.userData.animationTracks;
  if (!tracks[trackName]) {
    tracks[trackName] = [];
  }

  const track = tracks[trackName];
  const existingIdx = track.findIndex(kf => Math.abs(kf.time - time) < 0.01);

  if (existingIdx !== -1) {
    // Update existing keyframe value
    track[existingIdx].value = value;
  } else {
    // Insert new keyframe with default flat handles (tangent length = 0.2s)
    const newKf = {
      time: time,
      value: value,
      leftHandle: { timeOffset: -0.2, valueOffset: 0.0 },
      rightHandle: { timeOffset: 0.2, valueOffset: 0.0 }
    };
    track.push(newKf);
    track.sort((a, b) => a.time - b.time);
  }

  // Trigger cameraChange to update scrubber markers UI
  state.triggerEvent('cameraChange', object);
}

/**
 * Clears all keyframes across all tracks on an object.
 */
export function clearAllObjectKeyframes(object) {
  if (!object || !object.userData) return;
  object.userData.animationTracks = {};
  state.triggerEvent('cameraChange', object);
}
