// state.js - Central State Management

class EditorState {
  constructor() {
    // 3D core objects
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    // Controls
    this.orbitControls = null;
    this.transformControls = null;
    this.effectComposer = null;
    this.bloomPass = null;
    
    // Editor status
    this.selectedObject = null;
    this.globalColor = "#00ffff"; // Default wireframe color
    this.colorTargetMode = "selected"; // "selected" or "all"
    this.isBloomEnabled = true;
    this.bloomStrength = 1.6;
    this.isGridVisible = true;
    this.gridHelper = null;
    this.axesHelper = null;
    
    // Edit Mode state
    this.editorMode = 'object';          // 'object' | 'edit'
    this.editSubMode = 'vertex';         // 'vertex' | 'edge' | 'face'
    this.editTargetMesh = null;          // Mesh currently in edit mode
    this.selectedVertices = new Set();   // Selected vertex indices
    this.selectedEdges = new Set();      // Selected edge keys ("v1-v2")
    this.selectedFaces = new Set();      // Selected face indices
    
    // Command history reference
    this.history = null;
    
    // Event listeners
    this.listeners = {
      selection: [],
      hierarchy: [],
      properties: [],
      color: [],
      history: [],
      modeChange: [],
      editSelection: []
    };
  }

  // Subscribe to changes
  addEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  // Fire events
  triggerEvent(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  // Check if an object is the current edit target or a parent container of the edit target mesh
  isEditTarget(object) {
    if (!this.editTargetMesh) return false;
    if (object === this.editTargetMesh) return true;
    
    let isParent = false;
    if (object && object.traverse) {
      object.traverse(child => {
        if (child === this.editTargetMesh) {
          isParent = true;
        }
      });
    }
    return isParent;
  }

  // Select an object
  setSelectedObject(object) {
    if (this.selectedObject === object) return;
    
    // If in edit mode and selecting a different object (or null), exit edit mode first
    if (this.editorMode === 'edit' && !this.isEditTarget(object)) {
      this.exitEditMode();
    }
    
    this.selectedObject = object;
    
    // Sync TransformControls attachment
    if (this.transformControls) {
      // In Edit Mode, don't attach TransformControls directly to the mesh/object being edited.
      // The Edit Mode controller will manage attaching it to the sub-elements (gizmoTarget).
      if (this.editorMode === 'edit' && this.isEditTarget(object)) {
        // Do nothing, let Edit Mode controller handle the gizmoTarget attachment
      } else if (object && object.isObject3D && !object.isScene && !object.isGridHelper && !object.isAxesHelper) {
        this.transformControls.attach(object);
      } else {
        this.transformControls.detach();
      }
    }
    
    this.triggerEvent('selection', object);
  }

  // Triggered when scene tree additions, deletions, or structural reparents happen
  notifyHierarchyChanged() {
    this.triggerEvent('hierarchy');
  }

  // Triggered when current selection properties are updated (position, rotation, scale, name, visibility)
  notifyPropertiesChanged(object) {
    this.triggerEvent('properties', object || this.selectedObject);
  }

  // Triggered when global color or swatch colors change
  setGlobalColor(hex) {
    this.globalColor = hex;
    this.triggerEvent('color', hex);
  }

  // Triggered when Undo/Redo happens to update state bar/buttons
  notifyHistoryChanged() {
    this.triggerEvent('history');
  }

  // Enter Edit Mode for a mesh
  enterEditMode(mesh) {
    if (this.editorMode === 'edit') return false;
    if (!mesh || !mesh.isMesh) return false;
    this.editorMode = 'edit';
    this.editTargetMesh = mesh;
    this.selectedVertices.clear();
    this.selectedEdges.clear();
    this.selectedFaces.clear();
    this.editSubMode = 'vertex';
    
    // Detach transform controls from object
    if (this.transformControls) {
      this.transformControls.detach();
    }
    
    this.triggerEvent('modeChange', { mode: 'edit', mesh });
    return true;
  }

  // Exit Edit Mode
  exitEditMode() {
    const wasInEdit = this.editorMode === 'edit';
    this.editorMode = 'object';
    this.editTargetMesh = null;
    this.selectedVertices.clear();
    this.selectedEdges.clear();
    this.selectedFaces.clear();
    
    // Re-attach transform controls if object is selected
    if (this.selectedObject && this.transformControls) {
      this.transformControls.attach(this.selectedObject);
    }
    
    if (wasInEdit) {
      this.triggerEvent('modeChange', { mode: 'object', mesh: null });
    }
  }

  // Switch sub-mode in Edit Mode
  setEditSubMode(mode) {
    if (this.editorMode !== 'edit') return;
    if (!['vertex', 'edge', 'face'].includes(mode)) return;
    this.editSubMode = mode;
    this.selectedVertices.clear();
    this.selectedEdges.clear();
    this.selectedFaces.clear();
    this.triggerEvent('editSelection', { subMode: mode });
  }

  // Notify sub-element selection changes
  notifyEditSelectionChanged() {
    this.triggerEvent('editSelection', {
      subMode: this.editSubMode,
      vertices: this.selectedVertices,
      edges: this.selectedEdges,
      faces: this.selectedFaces
    });
  }
}

// Export singleton instance
export const state = new EditorState();
