import React, { useState, useMemo } from 'react';
import './SectionSelector.css';

const SectionSelector = ({ structure, onSelectionChange }) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Build tree from flat structure with circular reference protection
  const tree = useMemo(() => {
    if (!structure || structure.length === 0) return [];
    
    const elementsMap = {};
    const roots = [];
    const processed = new Set(); // Track processed nodes to prevent cycles
    
    // Create map of all elements
    structure.forEach(elem => {
      if (elem.id) {
        elementsMap[elem.id] = { ...elem, children: [] };
      }
    });
    
    // Build tree with cycle detection
    structure.forEach(elem => {
      if (!elem.id || processed.has(elem.id)) return; // Skip if already processed or no ID
      
      const node = elementsMap[elem.id];
      if (!node) return;
      
      const parentId = elem.parent_id;
      
      if (parentId && elementsMap[parentId] && parentId !== elem.id) { // Prevent self-reference
        // Check for circular reference
        let current = parentId;
        const visited = new Set([elem.id]);
        while (current && elementsMap[current]) {
          if (visited.has(current)) {
            // Circular reference detected - treat as root
            roots.push(node);
            processed.add(elem.id);
            return;
          }
          visited.add(current);
          current = elementsMap[current].parent_id;
        }
        
        elementsMap[parentId].children.push(node);
        processed.add(elem.id);
      } else {
        roots.push(node);
        processed.add(elem.id);
      }
    });
    
    return roots;
  }, [structure]);

  // Handle checkbox change with cascading
  const handleCheckboxChange = (elementId, checked, element) => {
    const newSelected = new Set(selectedIds);
    
    if (checked) {
      // Select element and all children
      newSelected.add(elementId);
      const selectChildren = (node) => {
        node.children?.forEach(child => {
          newSelected.add(child.id);
          if (child.children?.length > 0) {
            selectChildren(child);
          }
        });
      };
      selectChildren(element);
    } else {
      // Deselect element and all children
      newSelected.delete(elementId);
      const deselectChildren = (node) => {
        node.children?.forEach(child => {
          newSelected.delete(child.id);
          if (child.children?.length > 0) {
            deselectChildren(child);
          }
        });
      };
      deselectChildren(element);
    }
    
    setSelectedIds(newSelected);
    if (onSelectionChange) {
      onSelectionChange(Array.from(newSelected));
    }
  };

  // Check if all children are selected (for indeterminate state)
  const areAllChildrenSelected = (node) => {
    if (!node.children || node.children.length === 0) return false;
    return node.children.every(child => selectedIds.has(child.id));
  };

  // Check if some children are selected (for indeterminate state)
  const areSomeChildrenSelected = (node) => {
    if (!node.children || node.children.length === 0) return false;
    return node.children.some(child => selectedIds.has(child.id));
  };

  const toggleExpand = (elementId) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(elementId)) {
      newExpanded.delete(elementId);
    } else {
      newExpanded.add(elementId);
    }
    setExpandedIds(newExpanded);
  };

  const renderNode = (node, depth = 0, visited = new Set()) => {
    // Prevent infinite recursion from circular references
    if (!node || !node.id) return null;
    if (visited.has(node.id)) {
      console.warn(`Circular reference detected for node ${node.id}`);
      return null;
    }
    visited.add(node.id);
    
    // Limit depth to prevent stack overflow
    if (depth > 50) {
      console.warn(`Maximum depth reached for node ${node.id}`);
      return null;
    }
    
    const isSelected = selectedIds.has(node.id);
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const allChildrenSelected = areAllChildrenSelected(node);
    const someChildrenSelected = areSomeChildrenSelected(node);
    const isIndeterminate = someChildrenSelected && !allChildrenSelected;

    const indent = depth * 20;
    const typeLabel = node.type || 'unknown';
    const title = node.metadata?.title || node.content?.substring(0, 50) || node.id;

    return (
      <div key={node.id} className="structure-node" style={{ marginLeft: `${indent}px` }}>
        <div className="structure-node-header">
          <label className="structure-checkbox-label">
            <input
              type="checkbox"
              checked={isSelected || allChildrenSelected}
              ref={el => {
                if (el) el.indeterminate = isIndeterminate;
              }}
              onChange={(e) => handleCheckboxChange(node.id, e.target.checked, node)}
              className="structure-checkbox"
            />
            <span className="structure-type-badge">{typeLabel}</span>
            <span className="structure-title">{title}</span>
          </label>
          {hasChildren && (
            <button
              className="expand-button"
              onClick={() => toggleExpand(node.id)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="structure-children">
            {node.children
              .filter(child => child && child.id) // Filter out invalid children
              .map(child => renderNode(child, depth + 1, new Set(visited)))}
          </div>
        )}
      </div>
    );
  };

  if (!structure || structure.length === 0) {
    return (
      <div className="empty-structure">
        <p>No document structure available. Start adding content to see sections.</p>
      </div>
    );
  }

  return (
    <div className="section-selector">
      <div className="section-selector-header">
        <h3>Select Sections to Attach</h3>
        <button
          className="clear-selection-button"
          onClick={() => {
            setSelectedIds(new Set());
            if (onSelectionChange) {
              onSelectionChange([]);
            }
          }}
          disabled={selectedIds.size === 0}
        >
          Clear Selection
        </button>
      </div>
      <div className="structure-tree">
        {tree
          .filter(root => root && root.id) // Filter out invalid roots
          .map(root => renderNode(root, 0, new Set()))}
      </div>
      {selectedIds.size > 0 && (
        <div className="selection-summary">
          {selectedIds.size} section{selectedIds.size !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
};

export default SectionSelector;

