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
    
    // Command history reference
    this.history = null;
    
    // Event listeners
    this.listeners = {
      selection: [],
      hierarchy: [],
      properties: [],
      color: [],
      history: []
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

  // Select an object
  setSelectedObject(object) {
    if (this.selectedObject === object) return;
    
    this.selectedObject = object;
    
    // Sync TransformControls attachment
    if (this.transformControls) {
      if (object && object.isObject3D && !object.isScene && !object.isGridHelper && !object.isAxesHelper) {
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
}

// Export singleton instance
export const state = new EditorState();
