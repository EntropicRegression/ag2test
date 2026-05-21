// main.js - Core Three.js Scene Setup and Animation Loop
import * as THREE from 'three';
import { state } from './state.js';
import { HistoryManager } from './history.js';
import { initControls } from './controls.js';
import { initSelection } from './selection.js';
import { initToolbar } from './toolbar.js';
import { initHierarchy } from './hierarchy.js';
import { initProperties } from './properties.js';
import { initBloom } from './bloom.js';
import { initEditMode } from './editMode.js';
import { interpolateCamera, updateCameraHelper } from './camera.js';
import { interpolateObject, evaluateTrack } from './animation.js';

// Setup elements
const container = document.getElementById('canvas-container');
const statusFps = document.getElementById('status-fps');
const statusCount = document.getElementById('status-object-count');

// FPS counter variables
let lastTime = performance.now();
let frameCount = 0;
let fps = 60;

function init() {
  // 1. Create Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05050a');
  state.scene = scene;

  // 2. Create Camera
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(10, 10, 15);
  state.camera = camera;

  // 3. Create WebGL Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  // Tone mapping and color space setup
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = 1.0;
  
  container.appendChild(renderer.domElement);
  state.renderer = renderer;

  // 4. Grid and Axis Helpers (NO layer manipulation — stay on default Layer 0)
  const gridHelper = new THREE.GridHelper(50, 50, '#00ffcc', '#222233');
  gridHelper.isGridHelper = true;
  gridHelper.position.y = -0.01; // Slightly below zero to avoid z-fighting
  scene.add(gridHelper);
  state.gridHelper = gridHelper;

  const axesHelper = new THREE.AxesHelper(5);
  axesHelper.isAxesHelper = true;
  scene.add(axesHelper);
  state.axesHelper = axesHelper;

  // 5. Ambient Light (Low intensity, since we want neon wireframe focus)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  ambientLight.name = "環境光 (預設)";
  scene.add(ambientLight);

  // Directional Light
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(5, 10, 7);
  dirLight.name = "平行光 (預設)";
  scene.add(dirLight);

  // 6. Initialize History
  state.history = new HistoryManager();

  // 7. Initialize Modules (Depends on scene/renderer/camera)
  initControls();
  initSelection();
  initBloom(); // Sets up composer
  initToolbar();
  initHierarchy();
  initProperties();
  initEditMode();

  // State event listeners for Camera and Timeline synchronization
  state.addEventListener('cameraChange', (activeCam) => {
    let renderingCam = state.activeViewportCamera || state.camera;
    
    let targetCamera = null;
    let cameraGroup = null;
    
    if (activeCam) {
      if (activeCam.isCamera) {
        targetCamera = activeCam;
        if (activeCam.parent && activeCam.parent.isSceneCamera) {
          cameraGroup = activeCam.parent;
        }
      } else if (activeCam.isSceneCamera) {
        cameraGroup = activeCam;
        targetCamera = activeCam.getObjectByName("CameraInstance");
      }
    }
    
    if (targetCamera) {
      renderingCam = targetCamera;
      
      // Update aspect ratio & projection matrix safely
      if (targetCamera !== state.camera) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        targetCamera.aspect = width / height;
        targetCamera.updateProjectionMatrix();
      }
    }
    
    if (cameraGroup) {
      updateCameraHelper(cameraGroup);
    }
    
    // Sync TransformControls camera reference so gizmo drags correctly through new perspective
    if (state.transformControls && renderingCam && renderingCam.isCamera) {
      state.transformControls.camera = renderingCam;
    }

    // Recalculate and update the 3D motion path spline in the editor screen
    updateMotionPathHelper();
  });

  state.addEventListener('selection', () => {
    // Rebuild the 3D motion path when the selected object changes
    updateMotionPathHelper();
  });

  state.addEventListener('timelineChange', (data) => {
    // Interpolate all cameras and animated objects immediately when time updates ( scrub / play / undo )
    if (data.time !== undefined) {
      scene.traverse(child => {
        if (child.userData && child.userData.animationTracks && Object.keys(child.userData.animationTracks).length > 0) {
          interpolateObject(child, data.time);
        } else if (child.isSceneCamera) {
          interpolateCamera(child, data.time);
        }
      });

      // Update the 3D motion path playhead ball position matching current time
      updatePlayheadBall();
    }
  });

  // 8. Event Listeners
  window.addEventListener('resize', onWindowResize);
  
  // Prevent context menu in viewport
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

  // 9. Initial Lucide compilation
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 10. Start Loop
  console.log(`[NeoWire3D init] Container size: ${container.clientWidth}x${container.clientHeight}`);
  onWindowResize();
  animate();
}

function onWindowResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const aspect = width / height;
  
  state.camera.aspect = aspect;
  state.camera.updateProjectionMatrix();
  
  // Resize active viewport camera if set
  if (state.activeViewportCamera) {
    state.activeViewportCamera.aspect = aspect;
    state.activeViewportCamera.updateProjectionMatrix();
    const parentGroup = state.activeViewportCamera.parent;
    if (parentGroup && parentGroup.isSceneCamera) {
      updateCameraHelper(parentGroup);
    }
  }
  
  state.renderer.setSize(width, height);
  if (state.effectComposer) {
    state.effectComposer.setSize(width, height);
  }
}

let lastFrameTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const deltaTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  // Drive animation timeline playback
  if (state.timeline.isPlaying) {
    let newTime = state.timeline.currentTime + deltaTime;
    if (newTime >= state.timeline.duration) {
      newTime = 0.0; // Loop playback
    }
    state.setAnimationTime(newTime, false);
  }

  // Update OrbitControls
  if (state.orbitControls) {
    state.orbitControls.update();
  }

  // Get active rendering camera
  const renderingCamera = state.activeViewportCamera || state.camera;

  // Render — simple single-pass approach
  if (state.isBloomEnabled && state.effectComposer) {
    // Swap camera dynamically in Bloom Pass RenderPass
    const renderPass = state.effectComposer.passes[0];
    if (renderPass) {
      renderPass.camera = renderingCamera;
    }
    // EffectComposer handles everything: renders scene with bloom and outputs to screen
    state.effectComposer.render();
  } else {
    // Standard render without bloom
    state.renderer.render(state.scene, renderingCamera);
  }

  // Calculate FPS
  frameCount++;
  const time = performance.now();
  if (time >= lastTime + 1000) {
    fps = Math.round((frameCount * 1000) / (time - lastTime));
    statusFps.textContent = `FPS: ${fps}`;
    frameCount = 0;
    lastTime = time;
  }

  // Update Object Count
  let count = 0;
  state.scene.traverse(child => {
    if (child !== state.scene && !child.isGridHelper && !child.isAxesHelper
        && child.name !== '__EditModeHelpers__' && !child.userData.isEditPickHelper) {
      // Skip children of edit mode helpers group
      let isEditChild = false;
      let p = child.parent;
      while (p && p !== state.scene) {
        if (p.name === '__EditModeHelpers__') { isEditChild = true; break; }
        p = p.parent;
      }
      if (!isEditChild) count++;
    }
  });
  statusCount.textContent = `物件總數: ${count}`;
}

// Start application
window.addEventListener('DOMContentLoaded', init);

// Animation 3D Motion Path helper visualizer
let motionPathGroup = null;

function updateMotionPathHelper() {
  // If the scene or state is not initialized yet, abort
  if (!state.scene) return;

  // If the group doesn't exist, create it and add to scene
  if (!motionPathGroup) {
    motionPathGroup = new THREE.Group();
    motionPathGroup.name = "__AnimationPathHelper__";
    motionPathGroup.userData.isEditPickHelper = true; // Excludes it from selection raycasting in selection.js
    state.scene.add(motionPathGroup);
  }

  // Clear existing children
  while (motionPathGroup.children.length > 0) {
    const child = motionPathGroup.children[0];
    motionPathGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  }

  const obj = state.selectedObject;
  if (!obj || !obj.userData || !obj.userData.animationTracks) {
    return;
  }

  const tracks = obj.userData.animationTracks;
  // Check if there's any position animation tracks
  if (!tracks['position.x'] && !tracks['position.y'] && !tracks['position.z']) {
    return;
  }

  // Get active position tracks
  const trackX = tracks['position.x'] || [];
  const trackY = tracks['position.y'] || [];
  const trackZ = tracks['position.z'] || [];

  // Gather all unique keyframe times across position tracks
  const timesSet = new Set();
  trackX.forEach(kf => timesSet.add(kf.time));
  trackY.forEach(kf => timesSet.add(kf.time));
  trackZ.forEach(kf => timesSet.add(kf.time));
  const kfTimes = Array.from(timesSet).sort((a, b) => a - b);

  if (kfTimes.length === 0) return;

  // Sample the spline path from time 0 to state.timeline.duration
  const duration = state.timeline.duration || 10.0;
  const samples = 150;
  const points = [];

  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * duration;
    
    // Evaluate x, y, z at time t
    const x = tracks['position.x'] ? evaluateTrack(tracks['position.x'], t) : obj.position.x;
    const y = tracks['position.y'] ? evaluateTrack(tracks['position.y'], t) : obj.position.y;
    const z = tracks['position.z'] ? evaluateTrack(tracks['position.z'], t) : obj.position.z;
    
    points.push(new THREE.Vector3(x, y, z));
  }

  // 1. Draw glowing neon path line (neon purple)
  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xbf00ff,
    transparent: true,
    opacity: 0.85
  });
  const pathLine = new THREE.Line(lineGeo, lineMat);
  pathLine.name = "PathLine";
  motionPathGroup.add(pathLine);

  // 2. Draw keyframe markers (neon cyan diamonds)
  const markerGeo = new THREE.OctahedronGeometry(0.12, 0);
  const markerMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    wireframe: true
  });

  kfTimes.forEach(t => {
    const x = tracks['position.x'] ? evaluateTrack(tracks['position.x'], t) : obj.position.x;
    const y = tracks['position.y'] ? evaluateTrack(tracks['position.y'], t) : obj.position.y;
    const z = tracks['position.z'] ? evaluateTrack(tracks['position.z'], t) : obj.position.z;

    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(x, y, z);
    marker.name = `KeyframeMarker-${t}`;
    motionPathGroup.add(marker);
  });

  // 3. Draw playhead indicator ball (neon pink)
  updatePlayheadBall();
}

function updatePlayheadBall() {
  if (!motionPathGroup) return;

  // Find and remove existing playhead ball
  const oldBall = motionPathGroup.getObjectByName("PlayheadBall");
  if (oldBall) {
    motionPathGroup.remove(oldBall);
    if (oldBall.geometry) oldBall.geometry.dispose();
    if (oldBall.material) oldBall.material.dispose();
  }

  const obj = state.selectedObject;
  if (!obj || !obj.userData || !obj.userData.animationTracks) return;

  const tracks = obj.userData.animationTracks;
  if (!tracks['position.x'] && !tracks['position.y'] && !tracks['position.z']) return;

  const t = state.timeline.currentTime;
  const x = tracks['position.x'] ? evaluateTrack(tracks['position.x'], t) : obj.position.x;
  const y = tracks['position.y'] ? evaluateTrack(tracks['position.y'], t) : obj.position.y;
  const z = tracks['position.z'] ? evaluateTrack(tracks['position.z'], t) : obj.position.z;

  const ballGeo = new THREE.SphereGeometry(0.14, 8, 8);
  const ballMat = new THREE.MeshBasicMaterial({
    color: 0xff3366
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(x, y, z);
  ball.name = "PlayheadBall";
  motionPathGroup.add(ball);
}
