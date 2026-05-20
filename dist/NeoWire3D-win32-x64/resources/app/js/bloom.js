// bloom.js - UnrealBloomPass Neon Glow Effect Setup
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { state } from './state.js';

export function initBloom() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // 1. Initialize EffectComposer
  const composer = new EffectComposer(state.renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 2. Render Pass (Renders base scene)
  const renderPass = new RenderPass(state.scene, state.camera);
  composer.addPass(renderPass);

  // 3. UnrealBloomPass (Creates the glowing neon effect)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    state.bloomStrength,   // glow strength
    0.6,                   // glow radius
    0.05                   // glow threshold
  );
  composer.addPass(bloomPass);
  state.bloomPass = bloomPass;

  // 4. OutputPass (Mandatory in modern Three.js after post-processing for sRGB correction)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  state.effectComposer = composer;
}
