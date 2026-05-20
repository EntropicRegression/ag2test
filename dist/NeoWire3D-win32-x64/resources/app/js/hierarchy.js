// hierarchy.js - Scene Graph Tree View with Drag & Drop Reparenting
import * as THREE from 'three';
import { state } from './state.js';
import { ReparentCommand, ChangePropertyCommand, RemoveObjectCommand } from './history.js';
import { focusCameraOnObject } from './objects.js';

const treeRoot = document.getElementById('hierarchy-tree');
const collapsedUuids = new Set();
let draggedUuid = null;
let dragPosition = 'child'; // 'child', 'top', 'bottom'

export function initHierarchy() {
  // Rebuild tree on scene structure changes
  state.addEventListener('hierarchy', rebuildTree);

  // Rebuild on selection changes to highlight the selected node
  state.addEventListener('selection', highlightSelectedNode);

  // Initial build
  rebuildTree();
}

function rebuildTree() {
  treeRoot.innerHTML = '';

  // Create Root "Scene" Node
  const sceneNode = createNodeElement(state.scene, 0);
  treeRoot.appendChild(sceneNode);

  // Bind icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function createNodeElement(object, depth) {
  const li = document.createElement('li');
  li.className = 'tree-item';

  const isScene = object.isScene;
  const uuid = object.uuid;

  // Tree row div
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.setAttribute('data-uuid', uuid);
  if (state.selectedObject === object) {
    row.classList.add('selected');
  }

  // 1. Indent
  row.style.paddingLeft = `${depth * 14 + 8}px`;

  // 2. Collapse Toggle
  const hasChildren = object.children.length > 0 && !isSceneHelper(object);
  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle';

  if (hasChildren) {
    const isCollapsed = collapsedUuids.has(uuid);
    toggle.innerHTML = isCollapsed
      ? '<i data-lucide="chevron-right"></i>'
      : '<i data-lucide="chevron-down"></i>';

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (collapsedUuids.has(uuid)) {
        collapsedUuids.delete(uuid);
      } else {
        collapsedUuids.add(uuid);
      }
      rebuildTree();
    });
  } else {
    toggle.style.width = '12px'; // spacer
    toggle.style.opacity = '0';
  }
  row.appendChild(toggle);

  // 3. Icon
  const icon = document.createElement('i');
  icon.className = 'tree-icon';
  let iconName = 'box';

  if (isScene) iconName = 'globe';
  else if (object.isGroup) iconName = 'folder';
  else if (object.isLight) iconName = 'lightbulb';
  else if (object.isCamera) iconName = 'video';
  else if (object.isMesh) {
    const geomType = object.geometry.type;
    if (geomType.includes('Box')) iconName = 'package';
    else if (geomType.includes('Sphere')) iconName = 'circle';
    else if (geomType.includes('Cylinder') || geomType.includes('Cone')) iconName = 'cone';
    else iconName = 'file-box';
  }
  icon.setAttribute('data-lucide', iconName);
  row.appendChild(icon);

  // 4. Label (Object Name)
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = object.name || (isScene ? '場景 Scene' : '未命名物件');
  row.appendChild(label);

  // Rename on Double Click
  if (!isScene) {
    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tree-label-input';
      input.value = object.name;

      row.replaceChild(input, label);
      input.focus();

      function finishRename() {
        const newName = input.value.trim() || object.name;
        if (newName !== object.name) {
          const cmd = new ChangePropertyCommand(object, 'name', object.name, newName);
          state.history.execute(cmd);
        }
        rebuildTree();
      }

      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') finishRename();
        if (ev.key === 'Escape') rebuildTree();
      });
    });
  }

  // 5. Visibility Toggle (eye icon)
  if (!isScene) {
    const visBtn = document.createElement('button');
    visBtn.className = 'tree-action-btn';
    visBtn.title = object.visible ? '隱藏物件' : '顯示物件';
    visBtn.innerHTML = object.visible
      ? '<i data-lucide="eye"></i>'
      : '<i data-lucide="eye-off"></i>';

    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cmd = new ChangePropertyCommand(object, 'visible', object.visible, !object.visible);
      state.history.execute(cmd);
    });
    row.appendChild(visBtn);
  }

  // 6. Delete Shortcut Button
  if (!isScene) {
    const delBtn = document.createElement('button');
    delBtn.className = 'tree-action-btn';
    delBtn.title = '刪除物件';
    delBtn.innerHTML = '<i data-lucide="trash"></i>';
    delBtn.style.color = '#ff3366';

    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cmd = new RemoveObjectCommand(object);
      state.history.execute(cmd);
    });
    row.appendChild(delBtn);
  }

  // Row Selection click
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isScene) {
      state.setSelectedObject(null);
    } else {
      state.setSelectedObject(object);
      // Double click or fast clicking centers camera
      if (e.detail === 2) {
        focusCameraOnObject(object);
      }
    }
  });

  li.appendChild(row);

  // --- DRAG AND DROP EVENTS ---
  if (!isScene) {
    row.setAttribute('draggable', 'true');
  }

  row.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    draggedUuid = uuid;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', uuid);
  });

  row.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    clearDragClasses();
  });

  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedUuid || draggedUuid === uuid) return;

    // Safety check: Don't drag parent into its own descendants
    const draggedObj = state.scene.getObjectByProperty('uuid', draggedUuid);
    if (draggedObj && isDescendant(draggedObj, object)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    const rect = row.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const height = rect.height;

    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-child');

    // Scene node only accepts child drop
    if (isScene) {
      row.classList.add('drag-over-child');
      dragPosition = 'child';
    } else {
      if (relY < height * 0.25) {
        row.classList.add('drag-over-top');
        dragPosition = 'top';
      } else if (relY > height * 0.75) {
        row.classList.add('drag-over-bottom');
        dragPosition = 'bottom';
      } else {
        row.classList.add('drag-over-child');
        dragPosition = 'child';
      }
    }

    e.dataTransfer.dropEffect = 'move';
  });

  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-child');
  });

  row.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDragClasses();

    if (!draggedUuid || draggedUuid === uuid) return;

    const draggedObj = state.scene.getObjectByProperty('uuid', draggedUuid);
    const targetObj = state.scene.getObjectByProperty('uuid', uuid);

    if (draggedObj && targetObj) {
      // Validate descendant cycle
      if (isDescendant(draggedObj, targetObj)) return;

      let parent = targetObj.parent;
      let cmd;

      if (dragPosition === 'child') {
        cmd = new ReparentCommand(draggedObj, targetObj);
      } else {
        // Target is peer - drop above or below targetObj in targetObj's parent
        if (parent) {
          let newIndex = parent.children.indexOf(targetObj);
          if (dragPosition === 'bottom') {
            newIndex += 1;
          }

          cmd = new ReparentCommand(draggedObj, parent);
          // Set custom order index property
          cmd.newIndex = newIndex;
        }
      }

      if (cmd) {
        state.history.execute(cmd);
      }
    }

    draggedUuid = null;
  });

  // Render Children
  const isCollapsed = collapsedUuids.has(uuid);
  const children = object.children.filter(child => !isSceneHelper(child));

  if (children.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'tree-children';
    if (isCollapsed) {
      ul.classList.add('collapsed');
    }

    children.forEach(child => {
      const childNode = createNodeElement(child, depth + 1);
      ul.appendChild(childNode);
    });

    li.appendChild(ul);
  }

  return li;
}

function clearDragClasses() {
  document.querySelectorAll('.tree-row').forEach(row => {
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-child');
  });
}

// Check if child is subchild of parent recursively
function isDescendant(parent, child) {
  let node = child.parent;
  while (node) {
    if (node === parent) return true;
    node = node.parent;
  }
  return false;
}

// Ignore core helpers or lights helpers in hierarchy list
function isSceneHelper(obj) {
  if (
    obj.isGridHelper ||
    obj.isAxesHelper ||
    obj.isTransformControls ||
    obj.type === 'TransformControls' ||
    obj.type === 'TransformControlsPlane' ||
    obj.type === 'TransformControlsGizmo' ||
    (obj.constructor && obj.constructor.name === 'TransformControls') ||
    obj.name === 'LightHelper' ||
    obj.name === '__EditModeHelpers__'
  ) {
    return true;
  }

  if (state.transformControls) {
    const helper = state.transformControls.getHelper();
    let curr = obj;
    while (curr) {
      if (curr === helper) return true;
      curr = curr.parent;
    }
  }

  return false;
}

// Highlight the selected element without rebuilding the whole tree
function highlightSelectedNode(selectedObj) {
  document.querySelectorAll('.tree-row').forEach(row => {
    row.classList.remove('selected');

    const uuid = row.getAttribute('data-uuid');
    if (selectedObj && uuid === selectedObj.uuid) {
      row.classList.add('selected');

      // Auto expand all parents of selected node if they are collapsed
      let p = selectedObj.parent;
      let changed = false;
      while (p) {
        if (collapsedUuids.has(p.uuid)) {
          collapsedUuids.delete(p.uuid);
          changed = true;
        }
        p = p.parent;
      }
      if (changed) {
        rebuildTree();
      }
    }
  });

  // Sync status bar selection string
  const selectionStatus = document.getElementById('status-selection');
  if (selectedObj) {
    selectionStatus.innerHTML = `<i data-lucide="box" class="inline-icon"></i> 已選取: ${selectedObj.name}`;
  } else {
    selectionStatus.textContent = '無選取物件';
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
