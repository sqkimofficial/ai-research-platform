"""
Agent Step Registry - Maps step IDs to descriptions and computes step text at runtime.

This allows us to store step IDs in the database and compute human-readable
descriptions at runtime, making it easy to update step descriptions without
modifying the database.
"""

from typing import Dict, Optional
from datetime import datetime


# Step type constants
STEP_TYPE_THINKING = 'thinking'
STEP_TYPE_TOOL_CALL = 'tool_call'
STEP_TYPE_PROCESSING = 'processing'


# Step ID constants
STEP_ID_START_PROCESSING = 'start_processing'
STEP_ID_SELECTING_TOOLS = 'selecting_tools'
STEP_ID_CALLING_PERPLEXITY = 'calling_perplexity'
STEP_ID_SEARCHING_PERPLEXITY = 'searching_perplexity'
STEP_ID_CALLING_VECTOR_DB = 'calling_vector_db'
STEP_ID_SEARCHING_VECTOR_DB = 'searching_vector_db'
STEP_ID_PROCESSING_TOOL_RESULTS = 'processing_tool_results'
STEP_ID_EXTRACTING_SOURCES = 'extracting_sources'
STEP_ID_VALIDATING_FORMAT = 'validating_format'
STEP_ID_ENSURING_FIELDS = 'ensuring_fields'
STEP_ID_FINALIZING = 'finalizing'


def compute_step_description(step_data: Dict) -> str:
    """
    Compute human-readable description from step data.
    
    Args:
        step_data: Dict with 'step_id', 'type', 'tool_name', 'args', 'timestamp'
        
    Returns:
        Human-readable description string
    """
    step_id = step_data.get('step_id')
    step_type = step_data.get('type')
    tool_name = step_data.get('tool_name')
    args = step_data.get('args', {})
    timestamp = step_data.get('timestamp')
    
    # Map step IDs to descriptions
    step_descriptions = {
        STEP_ID_START_PROCESSING: 'Starting to process your request...',
        STEP_ID_SELECTING_TOOLS: 'Selecting appropriate tools...',
        STEP_ID_CALLING_PERPLEXITY: 'Calling Perplexity research tool...',
        STEP_ID_SEARCHING_PERPLEXITY: f"Searching Perplexity for: {args.get('query', '')[:100]}{'...' if len(args.get('query', '')) > 100 else ''}",
        STEP_ID_CALLING_VECTOR_DB: 'Calling vector database search tool...',
        STEP_ID_SEARCHING_VECTOR_DB: f"Searching your documents for: {args.get('query', '')[:100]}{'...' if len(args.get('query', '')) > 100 else ''}",
        STEP_ID_PROCESSING_TOOL_RESULTS: 'Processing tool results...',
        STEP_ID_EXTRACTING_SOURCES: 'Extracting sources from tool results...',
        STEP_ID_VALIDATING_FORMAT: 'Validating response format...',
        STEP_ID_ENSURING_FIELDS: 'Ensuring all required fields are present...',
        STEP_ID_FINALIZING: 'Finalizing response...',
    }
    
    # If we have a step_id, use the registry
    if step_id and step_id in step_descriptions:
        return step_descriptions[step_id]
    
    # Fallback: compute from type and tool_name
    if step_type == STEP_TYPE_TOOL_CALL and tool_name:
        query = args.get('query', '')
        if tool_name == 'perplexity_research':
            return f"Searching Perplexity for: {query[:100]}{'...' if len(query) > 100 else ''}"
        elif tool_name == 'search_vector_database':
            return f"Searching your documents for: {query[:100]}{'...' if len(query) > 100 else ''}"
        else:
            return f"Calling {tool_name}"
    elif step_type == STEP_TYPE_THINKING:
        return step_data.get('description', 'Thinking...')
    elif step_type == STEP_TYPE_PROCESSING:
        return step_data.get('description', 'Processing...')
    
    # Last resort: use description if available
    return step_data.get('description', 'Step')


def create_step_data(
    step_id: str,
    step_type: str,
    tool_name: Optional[str] = None,
    args: Optional[Dict] = None,
    description: Optional[str] = None
) -> Dict:
    """
    Create step data object for storage in database.
    
    Args:
        step_id: Unique step identifier
        step_type: Type of step ('thinking', 'tool_call', 'processing')
        tool_name: Name of tool (for tool_call type)
        args: Tool arguments (for tool_call type)
        description: Optional custom description (fallback)
        
    Returns:
        Dict with step_id, type, tool_name, args, timestamp
    """
    return {
        'step_id': step_id,
        'type': step_type,
        'tool_name': tool_name,
        'args': args or {},
        'description': description,  # Fallback description
        'timestamp': datetime.utcnow().isoformat()
    }


def enrich_steps_with_descriptions(steps: list) -> list:
    """
    Enrich a list of step data objects with computed descriptions.
    
    Args:
        steps: List of step data dicts (from database)
        
    Returns:
        List of enriched step dicts with 'description' field added
    """
    enriched = []
    for step in steps:
        enriched_step = step.copy()
        # Compute description if not already present
        if 'description' not in enriched_step or not enriched_step['description']:
            enriched_step['description'] = compute_step_description(step)
        enriched.append(enriched_step)
    return enriched

