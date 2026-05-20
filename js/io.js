// io.js - GLTF / OBJ / FBX Importers and GLB Exporter
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { state } from './state.js';
import { AddObjectCommand } from './history.js';
import { focusCameraOnObject } from './objects.js';

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Show/Hide loader overlay
function showLoader(text) {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}

function hideLoader() {
  loadingOverlay.classList.add('hidden');
}

// 1. Process imported object
function processImportedObject(object, filename) {
  object.name = filename;
  
  // Set all meshes to wireframe with current global color
  object.traverse(child => {
    if (child.isMesh) {
      // Re-assign basic wireframe material to ensure uniform look across formats
      child.material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(state.globalColor),
        wireframe: true,
        side: THREE.DoubleSide
      });
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  // Calculate size and center model
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  
  // Position model at center, slightly above ground grid
  object.position.sub(center);
  object.position.y += 1.5;
  
  // Wrap import in Add Object Command
  const cmd = new AddObjectCommand(object);
  state.history.execute(cmd);
  
  // Focus camera
  focusCameraOnObject(object);
  hideLoader();
}

// 2. Trigger files import
export function triggerImport(files) {
  Array.from(files).forEach(file => {
    const extension = file.name.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(file);
    
    showLoader(`正在讀取並解析 ${file.name} ...`);

    const onError = (err) => {
      console.error(`Error loading model:`, err);
      alert(`載入模型失敗: ${file.name}\n請確認格式是否正確。`);
      hideLoader();
      URL.revokeObjectURL(url);
    };

    if (extension === 'gltf' || extension === 'glb') {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        processImportedObject(gltf.scene, file.name);
        URL.revokeObjectURL(url);
      }, undefined, onError);
      
    } else if (extension === 'obj') {
      const loader = new OBJLoader();
      loader.load(url, (obj) => {
        processImportedObject(obj, file.name);
        URL.revokeObjectURL(url);
      }, undefined, onError);
      
    } else if (extension === 'fbx') {
      const loader = new FBXLoader();
      loader.load(url, (fbx) => {
        processImportedObject(fbx, file.name);
        URL.revokeObjectURL(url);
      }, undefined, onError);
      
    } else {
      alert(`不支援的檔案格式: .${extension}`);
      hideLoader();
      URL.revokeObjectURL(url);
    }
  });
}

// 3. Trigger GLTF scene export
export function triggerExport() {
  showLoader("正在編譯並準備導出 GLB 場景...");

  const exporter = new GLTFExporter();
  const exportObjects = [];
  const tempHelpersMap = [];

  // Filter out editor grid, axes, transform controls, and lights helpers
  state.scene.children.forEach(child => {
    const isGizmoHelper = state.transformControls && child === state.transformControls.getHelper();
    if (
      !child.isGridHelper &&
      !child.isAxesHelper &&
      !child.isTransformControls &&
      !isGizmoHelper &&
      child.type !== 'TransformControls' &&
      child.type !== 'TransformControlsGizmo' &&
      !(child.constructor && child.constructor.name === 'TransformControls') &&
      child.name !== 'LightHelper' &&
      child.type !== 'TransformControlsPlane'
    ) {
      // Find and remove lights helpers temporarily from child lights
      const helpers = [];
      child.traverse(sub => {
        if (sub.name === 'LightHelper') {
          helpers.push({ parent: sub.parent, helper: sub });
        }
      });
      
      helpers.forEach(item => {
        item.parent.remove(item.helper);
        tempHelpersMap.push(item);
      });

      exportObjects.push(child);
    }
  });

  if (exportObjects.length === 0) {
    alert("場景中沒有可以導出的 3D 物件！");
    hideLoader();
    return;
  }

  // Parse scene as GLB Binary
  exporter.parse(
    exportObjects,
    (result) => {
      // Restore light helpers immediately after parsing completes
      tempHelpersMap.forEach(item => {
        item.parent.add(item.helper);
      });

      if (result instanceof ArrayBuffer) {
        saveArrayBuffer(result, 'neowire_scene.glb');
      } else {
        // Fallback to JSON
        saveString(JSON.stringify(result, null, 2), 'neowire_scene.gltf');
      }
      hideLoader();
    },
    (err) => {
      console.error("GLTF Export error:", err);
      alert("導出場景失敗，請查看主控台錯誤。");
      // Restore helpers in case of failure
      tempHelpersMap.forEach(item => {
        item.parent.add(item.helper);
      });
      hideLoader();
    },
    { binary: true }
  );
}

// Helper: Download ArrayBuffer as file
function saveArrayBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
}

// Helper: Download JSON string as file
function saveString(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
}

// Helper: Download anchor tag
function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
