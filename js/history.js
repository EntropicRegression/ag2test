// history.js - Command Pattern for Undo/Redo System
import * as THREE from 'three';
import { state } from './state.js';

// Base Command Class
export class Command {
  constructor() {
    this.name = "Base Command";
  }
  execute() {}
  undo() {}
}

// 1. Add Object Command
export class AddObjectCommand extends Command {
  constructor(object, parent) {
    super();
    this.name = `新增物件: ${object.name}`;
    this.object = object;
    this.parent = parent || state.scene;
    this.parentUuid = this.parent.uuid;
  }

  execute() {
    // Make sure we resolve the parent if it was re-created or changed
    const parent = state.scene.getObjectByProperty('uuid', this.parentUuid) || this.parent;
    parent.add(this.object);
    state.setSelectedObject(this.object);
    state.notifyHierarchyChanged();
  }

  undo() {
    const parent = this.object.parent;
    if (parent) {
      if (state.selectedObject === this.object) {
        state.setSelectedObject(null);
      }
      parent.remove(this.object);
      state.notifyHierarchyChanged();
    }
  }
}

// 2. Remove Object Command
export class RemoveObjectCommand extends Command {
  constructor(object) {
    super();
    this.name = `刪除物件: ${object.name}`;
    this.object = object;
    this.parent = object.parent || state.scene;
    this.parentUuid = this.parent.uuid;
    
    // Store child index to restore exact position
    this.childIndex = this.parent.children.indexOf(object);
  }

  execute() {
    if (state.selectedObject === this.object) {
      state.setSelectedObject(null);
    }
    this.parent.remove(this.object);
    state.notifyHierarchyChanged();
  }

  undo() {
    const parent = state.scene.getObjectByProperty('uuid', this.parentUuid) || this.parent;
    // Insert back at original index to preserve order
    if (this.childIndex >= 0 && this.childIndex < parent.children.length) {
      parent.children.splice(this.childIndex, 0, this.object);
      this.object.parent = parent;
    } else {
      parent.add(this.object);
    }
    state.setSelectedObject(this.object);
    state.notifyHierarchyChanged();
  }
}

// 3. Transform Command (Translate / Rotate / Scale)
export class TransformCommand extends Command {
  constructor(object, oldState, newState) {
    super();
    this.name = `調整變換: ${object.name}`;
    this.object = object;
    
    // Store positions, rotations, scales
    this.oldPos = oldState.position.clone();
    this.oldRot = oldState.rotation.clone();
    this.oldScale = oldState.scale.clone();
    
    this.newPos = newState.position.clone();
    this.newRot = newState.rotation.clone();
    this.newScale = newState.scale.clone();
  }

  execute() {
    this.object.position.copy(this.newPos);
    this.object.rotation.copy(this.newRot);
    this.object.scale.copy(this.newScale);
    this.object.updateMatrixWorld();
    state.notifyPropertiesChanged(this.object);
  }

  undo() {
    this.object.position.copy(this.oldPos);
    this.object.rotation.copy(this.oldRot);
    this.object.scale.copy(this.oldScale);
    this.object.updateMatrixWorld();
    state.notifyPropertiesChanged(this.object);
  }
}

// 4. Reparent Command (Hierarchy Drag & Drop)
export class ReparentCommand extends Command {
  constructor(object, newParent) {
    super();
    this.name = `重新分組: ${object.name}`;
    this.object = object;
    this.oldParent = object.parent || state.scene;
    this.oldParentUuid = this.oldParent.uuid;
    this.newParent = newParent;
    this.newParentUuid = newParent.uuid;
    
    // Store exact index in old parent
    this.oldIndex = this.oldParent.children.indexOf(object);
  }

  execute() {
    const newParent = state.scene.getObjectByProperty('uuid', this.newParentUuid) || this.newParent;
    
    // Use Three.js attach to maintain world coordinate position/scale
    newParent.attach(this.object);
    state.notifyHierarchyChanged();
    state.notifyPropertiesChanged(this.object);
  }

  undo() {
    const oldParent = state.scene.getObjectByProperty('uuid', this.oldParentUuid) || this.oldParent;
    
    // Attach back to old parent preserving world coordinates
    oldParent.attach(this.object);
    
    // Reposition to correct index if possible
    const currentIndex = oldParent.children.indexOf(this.object);
    if (currentIndex !== -1 && this.oldIndex !== -1) {
      oldParent.children.splice(currentIndex, 1);
      oldParent.children.splice(this.oldIndex, 0, this.object);
    }
    
    state.notifyHierarchyChanged();
    state.notifyPropertiesChanged(this.object);
  }
}

// 5. Change Property Command (Name, Visible, Light Intensity, etc.)
export class ChangePropertyCommand extends Command {
  constructor(object, property, oldValue, newValue) {
    super();
    this.name = `修改屬性 [${property}]: ${object.name}`;
    this.object = object;
    this.property = property;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }

  execute() {
    this.setProperty(this.newValue);
  }

  undo() {
    this.setProperty(this.oldValue);
  }

  setProperty(val) {
    if (this.property.startsWith('position.') || this.property.startsWith('rotation.') || this.property.startsWith('scale.')) {
      const parts = this.property.split('.'); // e.g. ["position", "x"]
      this.object[parts[0]][parts[1]] = val;
      this.object.updateMatrixWorld();
    } else {
      this.object[this.property] = val;
    }
    state.notifyPropertiesChanged(this.object);
    
    if (this.property === 'name' || this.property === 'visible') {
      state.notifyHierarchyChanged();
    }
  }
}

// 6. Change Single Object Wireframe Color
export class ChangeColorCommand extends Command {
  constructor(object, oldHex, newHex) {
    super();
    this.name = `更改顏色: ${object.name}`;
    this.object = object;
    this.oldHex = oldHex;
    this.newHex = newHex;
  }

  execute() {
    this.setColor(this.newHex);
  }

  undo() {
    this.setColor(this.oldHex);
  }

  setColor(hex) {
    this.object.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.color.set(hex);
      }
    });
    state.notifyPropertiesChanged(this.object);
  }
}

// 7. Change All Objects Wireframe Color (Batch Command)
export class BatchColorCommand extends Command {
  constructor(oldColorsMap, newHex) {
    super();
    this.name = `套用全域線框顏色`;
    this.oldColorsMap = oldColorsMap; // Map of object UUID -> hex color
    this.newHex = newHex;
  }

  execute() {
    state.scene.traverse(child => {
      if (child.isMesh && child.material && !child.isGridHelper && !child.isAxesHelper) {
        child.material.color.set(this.newHex);
      }
    });
    state.notifyPropertiesChanged();
  }

  undo() {
    state.scene.traverse(child => {
      if (child.isMesh && child.material && !child.isGridHelper && !child.isAxesHelper) {
        const oldColor = this.oldColorsMap.get(child.uuid);
        if (oldColor) {
          child.material.color.set(oldColor);
        }
      }
    });
    state.notifyPropertiesChanged();
  }
}

// 8. Vertex Move Command (Edit Mode)
export class VertexMoveCommand extends Command {
  constructor(mesh, vertexIndices, oldPositions, newPositions, editData, gizmoManager) {
    super();
    this.name = `移動頂點 (${vertexIndices.length}個)`;
    this.mesh = mesh;
    this.vertexIndices = vertexIndices;
    this.oldPositions = oldPositions;  // THREE.Vector3[]
    this.newPositions = newPositions;  // THREE.Vector3[]
    this.editData = editData;
    this.gizmoManager = gizmoManager;
  }

  execute() {
    this._applyPositions(this.newPositions);
  }

  undo() {
    this._applyPositions(this.oldPositions);
  }

  _applyPositions(positions) {
    const posAttr = this.mesh.geometry.attributes.position;
    for (let i = 0; i < this.vertexIndices.length; i++) {
      const idx = this.vertexIndices[i];
      const pos = positions[i];
      posAttr.setXYZ(idx, pos.x, pos.y, pos.z);
      if (this.editData && this.editData.positions[idx]) {
        this.editData.positions[idx] = { x: pos.x, y: pos.y, z: pos.z };
      }
    }
    posAttr.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.geometry.computeBoundingBox();

    if (this.gizmoManager) {
      this.gizmoManager.refreshPositions();
    }
    state.notifyEditSelectionChanged();
  }
}

// 9. Delete Element Command (Edit Mode) — uses geometry snapshot for reliable undo
export class DeleteElementCommand extends Command {
  constructor(mesh, geometrySnapshot, positionsSnapshot, editData, gizmoManager) {
    super();
    this.name = '刪除子元素';
    this.mesh = mesh;
    this.geometrySnapshot = geometrySnapshot; // geometry.clone() before deletion
    this.positionsSnapshot = positionsSnapshot;
    this.currentGeometry = mesh.geometry.clone(); // geometry after deletion
    this.editData = editData;
    this.gizmoManager = gizmoManager;
  }

  execute() {
    // Apply the deleted geometry (already applied when command was created)
    this._setGeometry(this.currentGeometry.clone());
  }

  undo() {
    // Restore the snapshot
    this._setGeometry(this.geometrySnapshot.clone());
  }

  _setGeometry(geom) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = geom;

    // Re-parse and rebuild gizmos if in edit mode
    if (this.editData && state.editorMode === 'edit') {
      this.editData.positions = [];
      this.editData.edges = [];
      this.editData.faces = [];
      this.editData.edgeSet.clear();
      this.editData.mesh = this.mesh;
      this.editData.parse();

      if (this.gizmoManager) {
        this.gizmoManager.build(this.editData);
      }
    }
  }
}

// 10. Add Face Command (Edit Mode)
export class AddFaceCommand extends Command {
  constructor(mesh, geometrySnapshot, positionsSnapshot, editData, gizmoManager) {
    super();
    this.name = '新增面';
    this.mesh = mesh;
    this.geometrySnapshot = geometrySnapshot;
    this.positionsSnapshot = positionsSnapshot;
    this.currentGeometry = mesh.geometry.clone();
    this.editData = editData;
    this.gizmoManager = gizmoManager;
  }

  execute() {
    this._setGeometry(this.currentGeometry.clone());
  }

  undo() {
    this._setGeometry(this.geometrySnapshot.clone());
  }

  _setGeometry(geom) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = geom;

    if (this.editData && state.editorMode === 'edit') {
      this.editData.positions = [];
      this.editData.edges = [];
      this.editData.faces = [];
      this.editData.edgeSet.clear();
      this.editData.mesh = this.mesh;
      this.editData.parse();

      if (this.gizmoManager) {
        this.gizmoManager.build(this.editData);
      }
    }
  }
}

// 9. Update Animation Tracks Command
export class UpdateAnimationTracksCommand extends Command {
  constructor(object, oldTracks, newTracks) {
    super();
    this.name = `修改動畫軌道: ${object.name}`;
    this.object = object;
    this.oldTracks = JSON.parse(JSON.stringify(oldTracks || {}));
    this.newTracks = JSON.parse(JSON.stringify(newTracks || {}));
  }

  execute() {
    this.object.userData.animationTracks = JSON.parse(JSON.stringify(this.newTracks));
    state.triggerEvent('cameraChange', this.object);
    state.setAnimationTime(state.timeline.currentTime, false);
  }

  undo() {
    this.object.userData.animationTracks = JSON.parse(JSON.stringify(this.oldTracks));
    state.triggerEvent('cameraChange', this.object);
    state.setAnimationTime(state.timeline.currentTime, false);
  }
}

// History stack controller
export class HistoryManager {
  constructor(maxSteps = 100) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSteps = maxSteps;
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    
    // Cap steps
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    
    this.redoStack = []; // Clear redo stack on new action
    state.notifyHistoryChanged();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    state.notifyHistoryChanged();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    
    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);
    state.notifyHistoryChanged();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  getUndoActionName() {
    if (this.undoStack.length === 0) return "";
    return this.undoStack[this.undoStack.length - 1].name;
  }
}
