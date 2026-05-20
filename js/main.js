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

  const axesHelper = new THREE.AxesHelper(5);
  axesHelper.isAxesHelper = true;
  scene.add(axesHelper);

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
  
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  
  state.renderer.setSize(width, height);
  if (state.effectComposer) {
    state.effectComposer.setSize(width, height);
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Update OrbitControls
  if (state.orbitControls) {
    state.orbitControls.update();
  }

  // Render — simple single-pass approach
  if (state.isBloomEnabled && state.effectComposer) {
    // EffectComposer handles everything: renders scene with bloom and outputs to screen
    state.effectComposer.render();
  } else {
    // Standard render without bloom
    state.renderer.render(state.scene, state.camera);
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
    if (child !== state.scene && !child.isGridHelper && !child.isAxesHelper) {
      count++;
    }
  });
  statusCount.textContent = `物件總數: ${count}`;
}

// Start application
window.addEventListener('DOMContentLoaded', init);
