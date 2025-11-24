"""
Service for managing document structure trees.
Maintains hierarchical structure of document elements and enables smart insertion.
"""
from typing import List, Dict, Optional, Any
import json
import re
import uuid

class DocumentStructureService:
    """Manages document structure as a tree"""
    
    @staticmethod
    def build_tree(structure: List[Dict]) -> Dict:
        """
        Build a tree structure from a flat list of elements.
        
        Args:
            structure: List of elements with id, type, content, parent_id, metadata
        
        Returns:
            Tree structure with children arrays
        """
        # Create a map of all elements by immutable id
        # Elements should have both 'id' (immutable UUID) and 'hierarchical_id' (positional)
        elements_map = {elem['id']: {**elem, 'children': []} for elem in structure}
        
        # Build tree by linking children to parents
        root_elements = []
        for elem in structure:
            node = elements_map[elem['id']]
            parent_id = elem.get('parent_id')
            
            # Backward compatibility: if no hierarchical_id exists, use id as fallback
            # (will be regenerated properly when tree is processed)
            if 'hierarchical_id' not in node:
                node['hierarchical_id'] = node.get('id', 'unknown')
            
            # Check for circular reference (element pointing to itself as parent)
            if parent_id == elem['id']:
                print(f"Warning: Element {elem['id']} has circular reference (parent_id points to itself). Treating as root.")
                root_elements.append(node)
            elif parent_id and parent_id in elements_map:
                # Check for potential cycle by traversing up the parent chain
                visited = set()
                current_id = parent_id
                cycle_detected = False
                
                while current_id and current_id in elements_map:
                    if current_id in visited:
                        cycle_detected = True
                        break
                    visited.add(current_id)
                    current_id = elements_map[current_id].get('parent_id')
                    # Also check if we're creating a cycle back to this element
                    if current_id == elem['id']:
                        cycle_detected = True
                        break
                
                if cycle_detected:
                    print(f"Warning: Circular reference detected for element {elem['id']}. Treating as root.")
                    root_elements.append(node)
                else:
                    # Add to parent's children
                    elements_map[parent_id]['children'].append(node)
            else:
                # Root element (no parent or parent not found)
                root_elements.append(node)
        
        return {
            'elements': elements_map,
            'roots': root_elements
        }
    
    @staticmethod
    def _regenerate_hierarchical_ids(tree: Dict) -> Dict:
        """
        Regenerate hierarchical IDs based on current tree position.
        Hierarchical IDs reflect position (para-1, para-2, sec-introduction, etc.)
        while keeping immutable 'id' for tracking.
        
        Args:
            tree: Tree structure with roots and elements
        
        Returns:
            Tree with updated hierarchical_id fields
        """
        def assign_hierarchical_id(node, parent_hierarchical_id=None, counters=None):
            if counters is None:
                counters = {}
            
            node_type = node.get('type', 'elem')
            
            # Determine prefix based on type
            prefix_map = {
                'section': 'sec',
                'subsection': 'subsec',
                'paragraph': 'para',
                'table': 'table',
                'code_block': 'code',
                'image': 'img',
                'list': 'list',
                'blockquote': 'quote'
            }
            prefix = prefix_map.get(node_type, 'elem')
            
            # For sections, try to use semantic names first
            if node_type == 'section':
                metadata = node.get('metadata', {})
                title = metadata.get('title', '')
                if not title:
                    # Try to extract from content
                    content = node.get('content', '')
                    header_match = re.match(r'^#+\s*(.+)$', content.strip())
                    if header_match:
                        title = header_match.group(1).strip()
                
                if title:
                    # Create semantic ID from title (e.g., "Introduction" -> "sec-introduction")
                    semantic_id = title.lower().replace(' ', '-').replace('_', '-')
                    # Remove special characters
                    semantic_id = re.sub(r'[^a-z0-9-]', '', semantic_id)
                    hierarchical_id = f"sec-{semantic_id}"
                else:
                    # Fallback to numbered
                    counter_key = f"{parent_hierarchical_id or 'root'}_{prefix}"
                    if counter_key not in counters:
                        counters[counter_key] = 0
                    counters[counter_key] += 1
                    hierarchical_id = f"{prefix}-{counters[counter_key]}"
            else:
                # Get or initialize counter for this prefix in this context
                counter_key = f"{parent_hierarchical_id or 'root'}_{prefix}"
                if counter_key not in counters:
                    counters[counter_key] = 0
                
                counters[counter_key] += 1
                hierarchical_id = f"{prefix}-{counters[counter_key]}"
            
            # Assign hierarchical_id
            node['hierarchical_id'] = hierarchical_id
            
            # Recursively assign to children
            for child in node.get('children', []):
                assign_hierarchical_id(child, hierarchical_id, counters)
        
        # Assign hierarchical IDs to all nodes
        for root in tree.get('roots', []):
            assign_hierarchical_id(root)
        
        return tree
    
    @staticmethod
    def flatten_tree(tree: Dict) -> List[Dict]:
        """
        Flatten a tree structure back to a list.
        Maintains order: parents before children, depth-first.
        Regenerates hierarchical IDs before flattening.
        
        Args:
            tree: Tree structure with roots and elements
        
        Returns:
            Flat list of elements
        """
        # Regenerate hierarchical IDs based on current position
        tree = DocumentStructureService._regenerate_hierarchical_ids(tree)
        
        result = []
        
        def traverse(node):
            # Add node (without children array)
            node_copy = {k: v for k, v in node.items() if k != 'children'}
            result.append(node_copy)
            
            # Traverse children
            for child in node.get('children', []):
                traverse(child)
        
        # Traverse all root elements
        for root in tree.get('roots', []):
            traverse(root)
        
        return result
    
    @staticmethod
    def find_element(tree: Dict, element_id: str) -> Optional[Dict]:
        """Find an element in the tree by ID"""
        return tree.get('elements', {}).get(element_id)
    
    @staticmethod
    def get_children(tree: Dict, element_id: str) -> List[Dict]:
        """Get all children of an element"""
        element = DocumentStructureService.find_element(tree, element_id)
        if element:
            return element.get('children', [])
        return []
    
    @staticmethod
    def get_siblings(tree: Dict, element_id: str) -> List[Dict]:
        """Get all siblings of an element (including itself)"""
        element = DocumentStructureService.find_element(tree, element_id)
        if not element:
            return []
        
        parent_id = element.get('parent_id')
        if parent_id:
            parent = DocumentStructureService.find_element(tree, parent_id)
            if parent:
                return parent.get('children', [])
        else:
            # Root element - return all roots
            return tree.get('roots', [])
        
        return []
    
    @staticmethod
    def insert_element(
        tree: Dict,
        new_element: Dict,
        placement: Dict
    ) -> Dict:
        """
        Insert a new element into the tree based on placement instructions.
        
        Args:
            tree: Current document structure tree
            new_element: Element to insert (with id, type, content, metadata)
            placement: Placement instructions from AI
                {
                    "strategy": "insert_after" | "insert_before" | "insert_into" | "insert_at_end",
                    "target_id": "element-id" | null,
                    "position": "beginning" | "end" | null  # for insert_into
                }
        
        Returns:
            Updated tree structure
        """
        strategy = placement.get('strategy', 'insert_at_end')
        target_id = placement.get('target_id')
        position = placement.get('position', 'end')
        
        # Check if element already exists - prevent duplicates
        element_id = new_element.get('id')
        if element_id and element_id in tree.get('elements', {}):
            existing_element = tree['elements'][element_id]
            # Check if it's already in the tree structure (not just in elements map)
            # If it exists, we should not insert it again
            print(f"Warning: Element {element_id} already exists in tree. Skipping duplicate insertion.")
            return tree
        
        # Create a deep copy of the element to avoid reference issues
        # This prevents modifying the original element and causing duplicates
        import copy
        new_element = copy.deepcopy({**new_element, 'children': []})
        
        if strategy == 'insert_at_end':
            # Add as root element at the end
            tree['roots'].append(new_element)
            tree['elements'][new_element['id']] = new_element
        
        elif strategy == 'insert_after' and target_id:
            target = DocumentStructureService.find_element(tree, target_id)
            if target:
                parent_id = target.get('parent_id')
                siblings = DocumentStructureService.get_siblings(tree, target_id)
                
                # Find target index in siblings
                target_index = next((i for i, s in enumerate(siblings) if s['id'] == target_id), -1)
                
                if parent_id:
                    # Insert into parent's children after target
                    parent = DocumentStructureService.find_element(tree, parent_id)
                    if parent:
                        parent['children'].insert(target_index + 1, new_element)
                        new_element['parent_id'] = parent_id
                else:
                    # Insert into roots after target
                    tree['roots'].insert(target_index + 1, new_element)
                
                tree['elements'][new_element['id']] = new_element
        
        elif strategy == 'insert_before' and target_id:
            target = DocumentStructureService.find_element(tree, target_id)
            if target:
                parent_id = target.get('parent_id')
                siblings = DocumentStructureService.get_siblings(tree, target_id)
                
                # Find target index in siblings
                target_index = next((i for i, s in enumerate(siblings) if s['id'] == target_id), -1)
                
                if parent_id:
                    # Insert into parent's children before target
                    parent = DocumentStructureService.find_element(tree, parent_id)
                    if parent:
                        parent['children'].insert(target_index, new_element)
                        new_element['parent_id'] = parent_id
                else:
                    # Insert into roots before target
                    tree['roots'].insert(target_index, new_element)
                
                tree['elements'][new_element['id']] = new_element
        
        elif strategy == 'insert_into' and target_id:
            target = DocumentStructureService.find_element(tree, target_id)
            if target:
                element_id = new_element.get('id')
                
                # Check if element is already in target's children (prevent duplicates)
                existing_in_children = any(child.get('id') == element_id for child in target.get('children', []))
                if existing_in_children:
                    print(f"Warning: Element {element_id} already exists in target {target_id}'s children. Skipping duplicate insertion.")
                    return tree
                
                if position == 'beginning':
                    target['children'].insert(0, new_element)
                    print(f"DEBUG: Inserted {element_id} at BEGINNING of {target_id} (position 0, total children: {len(target['children'])})")
                else:  # end (default)
                    target['children'].append(new_element)
                    print(f"DEBUG: Inserted {element_id} at END of {target_id} (position {len(target['children'])-1}, total children: {len(target['children'])})")
                
                new_element['parent_id'] = target_id
                tree['elements'][new_element['id']] = new_element
        
        return tree
    
    @staticmethod
    def _generate_unique_id(existing_ids: set, prefix: str, base_id: Optional[str] = None) -> str:
        """
        Generate a unique ID that doesn't conflict with existing IDs.
        
        Args:
            existing_ids: Set of existing element IDs
            prefix: Prefix for the ID (e.g., "para", "sec", "table")
            base_id: Optional base ID to try first (e.g., "para-1")
        
        Returns:
            Unique ID string
        """
        if base_id and base_id not in existing_ids:
            return base_id
        
        # Try base_id with different numbers
        if base_id:
            # Extract number from base_id if it exists (e.g., "para-2" -> 2)
            match = re.search(r'-(\d+)$', base_id)
            if match:
                start_num = int(match.group(1))
            else:
                start_num = 1
        else:
            start_num = 1
        
        # Find next available number
        for i in range(start_num, start_num + 1000):  # Limit to prevent infinite loop
            candidate_id = f"{prefix}-{i}"
            if candidate_id not in existing_ids:
                return candidate_id
        
        # Fallback: use UUID if numbering fails
        return f"{prefix}-{str(uuid.uuid4())[:8]}"
    
    @staticmethod
    def _ensure_unique_ids(tree: Dict, new_structure: List[Dict]) -> List[Dict]:
        """
        Ensure all IDs in new_structure are unique and don't conflict with existing tree.
        Assigns immutable UUIDs as 'id' and preserves hierarchical_id from AI (will be regenerated later).
        
        Args:
            tree: Current document structure tree
            new_structure: List of new elements to insert
        
        Returns:
            List of elements with unique immutable IDs
        """
        # Collect all existing IDs from tree
        existing_ids = set()
        if tree.get('elements'):
            existing_ids.update(tree['elements'].keys())
        
        # Map old hierarchical_ids to new immutable IDs for parent_id updates
        hierarchical_to_immutable = {}
        if tree.get('elements'):
            for elem_id, elem in tree['elements'].items():
                hierarchical_id = elem.get('hierarchical_id')
                if hierarchical_id:
                    hierarchical_to_immutable[hierarchical_id] = elem_id
        
        updated_structure = []
        
        for elem in new_structure:
            # Generate immutable UUID for tracking
            immutable_id = str(uuid.uuid4())
            while immutable_id in existing_ids:
                immutable_id = str(uuid.uuid4())
            
            # Preserve hierarchical_id from AI (for reference, will be regenerated based on position)
            hierarchical_id = elem.get('id')  # AI provides this as the positional ID
            
            # Update parent_id: if it's a hierarchical_id, map it to immutable ID
            parent_id = elem.get('parent_id')
            if parent_id and parent_id in hierarchical_to_immutable:
                parent_id = hierarchical_to_immutable[parent_id]
            
            # Create updated element with immutable ID
            updated_elem = {
                **elem,
                'id': immutable_id,  # Immutable UUID
                'hierarchical_id': hierarchical_id  # Preserve AI's positional reference (temporary)
            }
            updated_structure.append(updated_elem)
            
            # Track mapping
            if hierarchical_id:
                hierarchical_to_immutable[hierarchical_id] = immutable_id
            existing_ids.add(immutable_id)
        
        return updated_structure
    
    @staticmethod
    def _map_hierarchical_to_immutable_id(tree: Dict, hierarchical_id: str) -> Optional[str]:
        """
        Map a hierarchical_id to its corresponding immutable ID.
        
        Args:
            tree: Tree structure
            hierarchical_id: Hierarchical/positional ID (e.g., "sec-introduction", "para-1")
        
        Returns:
            Immutable ID (UUID) or None if not found
        """
        if not tree.get('elements'):
            return None
        
        # First, regenerate hierarchical IDs to ensure they're up to date
        # Note: _regenerate_hierarchical_ids modifies tree in place, so we don't need to reassign
        DocumentStructureService._regenerate_hierarchical_ids(tree)
        
        # Search for element with matching hierarchical_id
        for elem_id, elem in tree['elements'].items():
            if elem.get('hierarchical_id') == hierarchical_id:
                return elem_id
        
        # Fallback: check if hierarchical_id is actually an immutable ID (backward compatibility)
        if hierarchical_id in tree['elements']:
            return hierarchical_id
        
        return None
    
    @staticmethod
    def insert_structure(
        tree: Dict,
        new_structure: List[Dict],
        placement: Dict
    ) -> Dict:
        """
        Insert multiple elements (a structure) into the tree.
        The placement applies to the root element(s) of the new structure.
        
        Args:
            tree: Current document structure tree
            new_structure: List of elements to insert (with parent relationships)
            placement: Placement instructions for where to insert the root element(s)
        
        Returns:
            Updated tree structure
        """
        # Ensure all IDs are unique before building tree
        new_structure = DocumentStructureService._ensure_unique_ids(tree, new_structure)
        
        # Build tree from new structure
        new_tree = DocumentStructureService.build_tree(new_structure)
        
        strategy = placement.get('strategy', 'insert_at_end')
        target_hierarchical_id = placement.get('target_id')
        
        # Map hierarchical_id to immutable ID if needed
        target_id = None
        if target_hierarchical_id:
            target_id = DocumentStructureService._map_hierarchical_to_immutable_id(tree, target_hierarchical_id)
            if not target_id:
                print(f"Warning: Could not find element with hierarchical_id '{target_hierarchical_id}'. Trying as immutable ID.")
                target_id = target_hierarchical_id  # Fallback for backward compatibility
        
        # Special handling for insert_into: if inserting into an existing section,
        # all elements in new_structure should be inserted as children of that section,
        # not as new root sections
        if strategy == 'insert_into' and target_id:
            target = DocumentStructureService.find_element(tree, target_id)
            if target:
                # Insert all root elements from new_structure as children of the target
                for root in new_tree['roots']:
                    root_type = root.get('type', '')
                    root_children = root.get('children', [])
                    
                    # If root is a section/subsection and we're inserting into an existing section,
                    # skip the section wrapper and insert its children directly
                    # (This handles cases where AI incorrectly creates a section element)
                    if root_type in ['section', 'subsection']:
                        print(f"Warning: Root element {root.get('id')} is a {root_type} when inserting into existing section. Inserting its children directly instead.")
                        # Insert children directly into target, skipping the section wrapper
                        # IMPORTANT: Preserve the position from original placement for the first child
                        original_position = placement.get('position', 'end')
                        def insert_children(parent_element_id, children, current_tree, use_original_position=False):
                            for i, child in enumerate(children):
                                child_children = child.get('children', [])
                                # Use original position only for the first child when skipping section wrapper
                                child_position = original_position if (use_original_position and i == 0) else 'end'
                                child_placement = {
                                    'strategy': 'insert_into',
                                    'target_id': parent_element_id,
                                    'position': child_position
                                }
                                print(f"DEBUG: Inserting child {child.get('id')} into {parent_element_id} at position: {child_position}")
                                current_tree = DocumentStructureService.insert_element(current_tree, child, child_placement)
                                if child_children:
                                    current_tree = insert_children(child['id'], child_children, current_tree, use_original_position=False)
                            return current_tree
                        
                        if root_children:
                            tree = insert_children(target_id, root_children, tree, use_original_position=True)
                    else:
                        # Normal case: insert root element as child of target
                        # IMPORTANT: Pass the position from placement to respect 'beginning' vs 'end'
                        child_placement = {
                            'strategy': 'insert_into',
                            'target_id': target_id,
                            'position': placement.get('position', 'end')  # Preserve position from original placement
                        }
                        print(f"DEBUG: Inserting root element {root.get('id')} into {target_id} at position: {child_placement.get('position')}")
                        tree = DocumentStructureService.insert_element(tree, root, child_placement)
                        
                        # Recursively insert all children of this root
                        def insert_children(parent_element_id, children, current_tree):
                            for child in children:
                                child_children = child.get('children', [])
                                child_placement = {
                                    'strategy': 'insert_into',
                                    'target_id': parent_element_id,
                                    'position': 'end'
                                }
                                current_tree = DocumentStructureService.insert_element(current_tree, child, child_placement)
                                if child_children:
                                    current_tree = insert_children(child['id'], child_children, current_tree)
                            return current_tree
                        
                        if root_children:
                            tree = insert_children(root['id'], root_children, tree)
            else:
                print(f"Warning: Target element {target_id} not found. Falling back to insert_at_end.")
                # Fallback: insert as root elements
                for root in new_tree['roots']:
                    root_children = root.get('children', [])
                    fallback_placement = {'strategy': 'insert_at_end', 'target_id': None}
                    tree = DocumentStructureService.insert_element(tree, root, fallback_placement)
                    
                    def insert_children(parent_element_id, children, current_tree):
                        for child in children:
                            child_children = child.get('children', [])
                            child_placement = {
                                'strategy': 'insert_into',
                                'target_id': parent_element_id,
                                'position': 'end'
                            }
                            current_tree = DocumentStructureService.insert_element(current_tree, child, child_placement)
                            if child_children:
                                current_tree = insert_children(child['id'], child_children, current_tree)
                        return current_tree
                    
                    if root_children:
                        tree = insert_children(root['id'], root_children, tree)
        else:
            # Normal insertion: insert root elements according to placement
            for root in new_tree['roots']:
                root_children = root.get('children', [])
                # Insert root element
                tree = DocumentStructureService.insert_element(tree, root, placement)
                
                # Recursively insert all children
                def insert_children(parent_element_id, children, current_tree):
                    for child in children:
                        child_children = child.get('children', [])
                        child_placement = {
                            'strategy': 'insert_into',
                            'target_id': parent_element_id,
                            'position': 'end'
                        }
                        current_tree = DocumentStructureService.insert_element(current_tree, child, child_placement)
                        if child_children:
                            current_tree = insert_children(child['id'], child_children, current_tree)
                    return current_tree
                
                if root_children:
                    tree = insert_children(root['id'], root_children, tree)
        
        return tree
    
    @staticmethod
    def tree_to_markdown(tree: Dict) -> str:
        """
        Convert tree structure back to markdown content.
        Traverses tree in order and concatenates element content.
        
        Args:
            tree: Document structure tree
        
        Returns:
            Markdown string
        """
        def traverse(node, result):
            # Add this element's content
            content = node.get('content', '')
            if content:
                result.append(content)
            
            # Traverse children
            for child in node.get('children', []):
                traverse(child, result)
        
        result = []
        for root in tree.get('roots', []):
            traverse(root, result)
        
        return '\n\n'.join(result)
    
    @staticmethod
    def get_structure_summary(tree: Dict) -> str:
        """
        Get a text summary of the document structure for AI context.
        Shows hierarchy and element IDs.
        
        Args:
            tree: Document structure tree
        
        Returns:
            Text summary string
        """
        def format_node(node, indent=0, visited=None, max_depth=50):
            # Prevent infinite recursion from cycles
            if visited is None:
                visited = set()
            
            # Check recursion depth
            if indent > max_depth:
                return f"{'  ' * indent}[... (max depth reached)]\n"
            
            elem_id = node.get('id', 'unknown')
            
            # Check for cycles
            if elem_id in visited:
                return f"{'  ' * indent}[{elem_id}] (circular reference detected)\n"
            
            visited.add(elem_id)
            
            prefix = '  ' * indent
            elem_type = node.get('type', 'unknown')
            metadata = node.get('metadata', {})
            
            # Get title if available
            title = metadata.get('title', '')
            if not title:
                # Try to extract from content (markdown headers)
                content = node.get('content', '')
                # Extract header text (remove # symbols and whitespace)
                header_match = re.match(r'^#+\s*(.+)$', content.strip())
                if header_match:
                    title = header_match.group(1).strip()
                else:
                    # Use first 50 chars as fallback
                    title = content[:50].strip() if content else ''
            
            title_str = f' - "{title}"' if title else ''
            
            line = f"{prefix}[{elem_id}] {elem_type}{title_str}\n"
            
            # Add children (with cycle protection)
            for child in node.get('children', []):
                child_id = child.get('id', 'unknown')
                if child_id not in visited:
                    line += format_node(child, indent + 1, visited.copy(), max_depth)
                else:
                    line += f"{'  ' * (indent + 1)}[{child_id}] (circular reference)\n"
            
            return line
        
        summary = "Current Document Structure:\n"
        summary += "NOTE: IDs shown in brackets [like-this] are hierarchical/positional IDs. Use these when referencing elements in placement.target_id and parent_id fields.\n\n"
        for root in tree.get('roots', []):
            summary += format_node(root)
        
        return summary

