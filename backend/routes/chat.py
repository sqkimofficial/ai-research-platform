from flask import Blueprint, request, jsonify
from models.database import ChatSessionModel, DocumentTypeModel, Database, DocumentModel, ProjectModel, ResearchDocumentModel
from services.openai_service import OpenAIService
from services.vector_service import VectorService
from services.document_structure_service import DocumentStructureService
from utils.auth import verify_token
from utils.file_helpers import get_session_dir
from datetime import datetime
import os
import json

chat_bp = Blueprint('chat', __name__)
openai_service = OpenAIService()
vector_service = VectorService()

# Initialize document types on module load
_initialized_types = False

def ensure_types_initialized():
    """Ensure document types are initialized"""
    global _initialized_types
    if not _initialized_types:
        try:
            Database.connect()
            DocumentTypeModel.initialize_default_types()
            _initialized_types = True
            print("Document types initialized")
        except Exception as e:
            print(f"Warning: Failed to initialize document types: {e}")

# Initialize on import
ensure_types_initialized()

def get_user_id_from_token():
    """Extract user_id from JWT token in Authorization header"""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    try:
        token = auth_header.split(' ')[1]  # Bearer <token>
        return verify_token(token)
    except:
        return None

def extract_placement_instructions(user_message, document_structure_flat):
    """
    Extract placement instructions from user message.
    Returns dict with placement info or None if no instructions found.
    Handles patterns like:
    - "at top of introduction"
    - "bottom of section 3"
    - "after introduction"
    - "in the background section"
    - "at the end"
    """
    import re
    message_lower = user_message.lower()
    placement = None
    
    # Enhanced placement patterns
    patterns = {
        'at_top_of': r'(?:at\s+top\s+of|top\s+of|beginning\s+of|start\s+of)\s+(?:the\s+)?([a-z\s]+?)(?:\s+section)?',
        'at_bottom_of': r'(?:at\s+bottom\s+of|bottom\s+of|end\s+of)\s+(?:the\s+)?([a-z\s]+?)(?:\s+section)?',
        'after': r'(?:after|following|following\s+the)\s+(?:the\s+)?([a-z\s]+?)(?:\s+section)?',
        'before': r'(?:before|preceding|preceding\s+the)\s+(?:the\s+)?([a-z\s]+?)(?:\s+section)?',
        'in': r'(?:in|into|within|inside)\s+(?:the\s+)?([a-z\s]+?)(?:\s+section)?',
        'at_end': r'(?:at\s+the\s+end|at\s+end|append|add\s+to\s+end)(?:\s+of\s+document)?',
    }
    
    # Check for "at the end" first (most specific)
    if re.search(patterns['at_end'], message_lower):
        return {
            'strategy': 'insert_at_end',
            'target_id': None,
            'position': None,
            'reason': 'User requested content at the end of document',
            'user_instruction': 'at the end'
        }
    
    # Check for "at top of [section]" - insert at beginning of section
    match = re.search(patterns['at_top_of'], message_lower)
    if match:
        section_name = match.group(1).strip()
        target_id = find_section_id_by_name(section_name, document_structure_flat)
        if target_id:
            return {
                'strategy': 'insert_into',
                'target_id': target_id,
                'position': 'beginning',
                'reason': f'User requested content at top/beginning of {section_name} section',
                'user_instruction': f'at top of {section_name}'
            }
    
    # Check for "at bottom of [section]" - insert at end of section
    match = re.search(patterns['at_bottom_of'], message_lower)
    if match:
        section_name = match.group(1).strip()
        target_id = find_section_id_by_name(section_name, document_structure_flat)
        if target_id:
            return {
                'strategy': 'insert_into',
                'target_id': target_id,
                'position': 'end',
                'reason': f'User requested content at bottom/end of {section_name} section',
                'user_instruction': f'at bottom of {section_name}'
            }
    
    # Check for "after [section]"
    match = re.search(patterns['after'], message_lower)
    if match:
        section_name = match.group(1).strip()
        target_id = find_section_id_by_name(section_name, document_structure_flat)
        if target_id:
            return {
                'strategy': 'insert_after',
                'target_id': target_id,
                'position': None,
                'reason': f'User requested content after {section_name} section',
                'user_instruction': f'after {section_name}'
            }
    
    # Check for "before [section]"
    match = re.search(patterns['before'], message_lower)
    if match:
        section_name = match.group(1).strip()
        target_id = find_section_id_by_name(section_name, document_structure_flat)
        if target_id:
            return {
                'strategy': 'insert_before',
                'target_id': target_id,
                'position': None,
                'reason': f'User requested content before {section_name} section',
                'user_instruction': f'before {section_name}'
            }
    
    # Check for "in [section]" or "add to [section]"
    match = re.search(patterns['in'], message_lower)
    if not match:
        # Also check for "add to [section]" pattern
        match = re.search(r'add\s+(?:to|in)\s+(?:the\s+)?([a-z\s]+?)(?:\s+section)?', message_lower)
    
    if match:
        section_name = match.group(1).strip()
        target_id = find_section_id_by_name(section_name, document_structure_flat)
        if target_id:
            # Check if user specified position within section
            position = 'end'  # default
            if 'top' in message_lower or 'beginning' in message_lower or 'start' in message_lower:
                position = 'beginning'
            elif 'bottom' in message_lower or 'end' in message_lower:
                position = 'end'
            
            return {
                'strategy': 'insert_into',
                'target_id': target_id,
                'position': position,
                'reason': f'User requested content in {section_name} section',
                'user_instruction': f'in {section_name}' + (f' at {position}' if position != 'end' else '')
            }
    
    # Check for section numbers (e.g., "section 3", "section 1")
    section_num_match = re.search(r'section\s+(\d+)', message_lower)
    if section_num_match:
        section_num = int(section_num_match.group(1))
        # Find section by index in structure
        sections = [e for e in document_structure_flat if e.get('type') in ['section', 'subsection']]
        if section_num <= len(sections):
            target_section = sections[section_num - 1]  # 1-indexed to 0-indexed
            target_id = target_section.get('id')
            
            # Check for position modifiers
            position = 'end'
            if 'top' in message_lower or 'beginning' in message_lower:
                position = 'beginning'
            elif 'bottom' in message_lower or 'end' in message_lower:
                position = 'end'
            
            if 'after' in message_lower:
                return {
                    'strategy': 'insert_after',
                    'target_id': target_id,
                    'position': None,
                    'reason': f'User requested content after section {section_num}',
                    'user_instruction': f'after section {section_num}'
                }
            elif 'before' in message_lower:
                return {
                    'strategy': 'insert_before',
                    'target_id': target_id,
                    'position': None,
                    'reason': f'User requested content before section {section_num}',
                    'user_instruction': f'before section {section_num}'
                }
            else:
                return {
                    'strategy': 'insert_into',
                    'target_id': target_id,
                    'position': position,
                    'reason': f'User requested content in section {section_num}',
                    'user_instruction': f'in section {section_num}' + (f' at {position}' if position != 'end' else '')
                }
    
    # No placement instructions found
    return None

def find_section_id_by_name(section_name, document_structure_flat):
    """Find section ID by matching name semantically"""
    if not document_structure_flat:
        return None
    
    section_name_lower = section_name.lower().strip()
    
    # Common section name variations
    name_variations = {
        'introduction': ['intro', 'introduction', 'introductions'],
        'methodology': ['methods', 'methodology', 'method', 'experimental methods'],
        'results': ['results', 'findings', 'experimental results'],
        'discussion': ['discussion', 'discussions'],
        'conclusion': ['conclusion', 'conclusions'],
        'references': ['references', 'reference', 'bibliography'],
        'abstract': ['abstract', 'summary']
    }
    
    # Check for exact or semantic match
    for element in document_structure_flat:
        if element.get('type') in ['section', 'subsection']:
            element_title = element.get('metadata', {}).get('title', '')
            element_title_lower = element_title.lower()
            
            # Exact match
            if section_name_lower in element_title_lower or element_title_lower in section_name_lower:
                return element.get('id')
            
            # Check variations
            for key, variations in name_variations.items():
                if section_name_lower in variations:
                    if any(var in element_title_lower for var in variations):
                        return element.get('id')
    
    return None

@chat_bp.route('/session', methods=['POST'])
def create_session():
    """Create a new chat session"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400
        
        # Verify project exists and belongs to user
        project = ProjectModel.get_project(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        if project['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized - project does not belong to user'}), 403
        
        session_id = ChatSessionModel.create_session(user_id, project_id)
        return jsonify({
            'session_id': session_id,
            'message': 'Session created successfully'
        }), 201
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chat_bp.route('/session', methods=['GET'])
def get_session():
    """Get session history or list all sessions"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        session_id = request.args.get('session_id')
        
        # If session_id is provided, get specific session
        if session_id:
            session = ChatSessionModel.get_session(session_id)
            if not session:
                return jsonify({'error': 'Session not found'}), 404
            
            # Verify user owns this session
            if session['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            # Log session entry details for Chrome extension configuration
            auth_header = request.headers.get('Authorization', '')
            token = auth_header.split(' ')[1] if auth_header.startswith('Bearer ') else 'N/A'
            project_id = session.get('project_id')
            print("=" * 60)
            print("SESSION ENTRY - Use these for Chrome Extension:")
            print(f"  JWT Token: {token}")
            print(f"  Project ID: {project_id}")
            print("=" * 60)
            
            # Serialize messages to ensure datetime objects and sources are properly formatted
            serialized_messages = []
            for msg in session.get('messages', []):
                serialized_msg = {
                    'role': msg.get('role'),
                    'content': msg.get('content', ''),
                    'timestamp': msg.get('timestamp').isoformat() if msg.get('timestamp') else datetime.utcnow().isoformat()
                }
                # Include sources if they exist
                if 'sources' in msg:
                    serialized_msg['sources'] = msg['sources']
                serialized_messages.append(serialized_msg)
            
            # Get project information
            project_name = None
            project_id = session.get('project_id')
            if project_id:
                project = ProjectModel.get_project(project_id)
                if project:
                    project_name = project.get('project_name')
            
            return jsonify({
                'session_id': session['session_id'],
                'project_id': project_id,
                'project_name': project_name,
                'messages': serialized_messages,
                'created_at': session['created_at'].isoformat(),
                'updated_at': session['updated_at'].isoformat()
            }), 200
        
        # If no session_id, return all sessions for the user
        # Optionally filter by project_id
        project_id_filter = request.args.get('project_id')
        sessions = ChatSessionModel.get_all_sessions(user_id, project_id_filter)
        sessions_list = []
        for session in sessions:
            # Get first user message for title
            title = "New Chat"
            messages = session.get('messages', [])
            for msg in messages:
                if msg.get('role') == 'user':
                    # Get first 5 words
                    content = msg.get('content', '')
                    words = content.split()[:5]
                    title = ' '.join(words) if words else "New Chat"
                    break
            
            # Get project information
            project_name = None
            project_id = session.get('project_id')
            if project_id:
                project = ProjectModel.get_project(project_id)
                if project:
                    project_name = project.get('project_name')
            
            sessions_list.append({
                'session_id': session['session_id'],
                'title': title,
                'project_id': project_id,
                'project_name': project_name,
                'created_at': session['created_at'].isoformat(),
                'updated_at': session['updated_at'].isoformat(),
                'message_count': len(messages)
            })
        
        return jsonify({'sessions': sessions_list}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chat_bp.route('/message', methods=['POST'])
def send_message():
    """Send a message and get AI response"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        session_id = data.get('session_id')
        message = data.get('message')
        attached_sections = data.get('attached_sections', [])  # Array of structure elements
        
        if not session_id or not message:
            return jsonify({'error': 'session_id and message are required'}), 400
        
        # Verify session belongs to user
        session = ChatSessionModel.get_session(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        if session['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Prepare attached sections markdown for context
        attached_markdown = ''
        if attached_sections:
            # Extract content from attached sections and combine
            attached_contents = [section.get('content', '') for section in attached_sections if section.get('content')]
            attached_markdown = '\n\n'.join(attached_contents)
            print(f"DEBUG: Attached {len(attached_sections)} sections to message")
            print(f"DEBUG: Attached markdown length: {len(attached_markdown)} chars")
        
        # Add user message with attached sections info
        user_message_with_attachments = message
        if attached_markdown:
            user_message_with_attachments = f"{message}\n\n[Attached sections from document:]\n\n{attached_markdown}"
        
        ChatSessionModel.add_message(session_id, 'user', user_message_with_attachments)
        
        # Get document content and structure for context
        session_dir = get_session_dir(session_id)
        doc_path = session_dir / 'doc.md'
        document_content = ''
        document_structure_flat = DocumentModel.get_document_structure(session_id)
        
        if os.path.exists(doc_path):
            with open(doc_path, 'r', encoding='utf-8') as f:
                document_content = f.read()
        
        # Build structure tree (initialize even if empty)
        # Ensure document_structure_flat is a list
        if document_structure_flat:
            if not isinstance(document_structure_flat, list):
                print(f"WARNING: document_structure_flat is not a list, got {type(document_structure_flat)}: {document_structure_flat}")
                document_structure_flat = []
        
        if document_structure_flat and len(document_structure_flat) > 0:
            try:
                document_structure_tree = DocumentStructureService.build_tree(document_structure_flat)
                structure_summary = DocumentStructureService.get_structure_summary(document_structure_tree)
            except Exception as e:
                print(f"WARNING: Failed to build structure tree: {e}")
                import traceback
                traceback.print_exc()
                document_structure_tree = {'elements': {}, 'roots': []}
                structure_summary = "No existing document structure."
        else:
            document_structure_tree = {'elements': {}, 'roots': []}
            structure_summary = "No existing document structure."
        
        # Get available document types (needed for system prompt)
        available_types = DocumentTypeModel.get_all_types()
        type_names = [t['type_name'] for t in available_types]
        type_descriptions = {t['type_name']: t['description'] for t in available_types}
        types_list = '\n'.join([f"- {name}: {type_descriptions.get(name, '')}" for name in type_names])
        
        # Build context with document using semantic search
        # Use vector semantic search to find and send only relevant chunks
        use_semantic_search = True  # Enabled: Only send relevant document chunks
        
        if document_content:
            if use_semantic_search:
                # Use semantic search to find relevant chunks
                # Combine user message with any attached sections for better context
                search_query = message
                if attached_markdown:
                    # Include attached sections context in search query
                    search_query = f"{message}\n\nContext: {attached_markdown[:500]}"
                
                relevant_chunks = vector_service.search_relevant_chunks(session_id, search_query, top_k=5)
                if relevant_chunks:
                    context_parts = [chunk['chunk_text'] for chunk in relevant_chunks]
                    document_context = '\n\n'.join(context_parts)
                    print(f"DEBUG: Using semantic search - found {len(relevant_chunks)} relevant chunks")
                else:
                    # Fallback to full document if no relevant chunks found (e.g., document not indexed yet)
                    document_context = document_content
                    print(f"DEBUG: No relevant chunks found, falling back to full document")
            else:
                # Send full document (fallback mode)
                document_context = document_content
            
            # Stage 1 AI System Prompt - Content Generation Only (No Placement)
            system_message = f"""You are a research assistant helping users write research papers. Your role is to GENERATE CONTENT ONLY - you do NOT decide where content should be placed in the document.

CRITICAL: UNDERSTANDING CURRENT VS HISTORICAL CONTEXT
- You will receive conversation history for context, but you MUST ONLY respond to the CURRENT USER MESSAGE (the last message)
- Historical messages are provided so you understand what was discussed previously, but you should NOT act on old instructions
- Only the CURRENT USER MESSAGE contains the instruction you need to fulfill RIGHT NOW
- If the conversation history shows previous requests, those have already been completed - do NOT repeat them
- Focus ONLY on what the current user message is asking for

You have two distinct responsibilities:

1. CHAT MESSAGE: Provide conversational, helpful responses focused on reasoning, answering questions, discussing ideas, and providing relevant snippets from the document when helpful. Be concise and conversational - this is for the chat interface.

2. DOCUMENT CONTENT GENERATION: When the user's request requires adding or updating the research document, generate well-structured, formal research content in Markdown format. Your ONLY job is to generate high-quality content - you do NOT provide placement instructions or decide where content goes.

3. DOCUMENT STRUCTURE: When providing document_content, you MUST also provide a structured representation in the "document_structure" field. This allows users to select and attach specific sections, paragraphs, tables, or code snippets.

4. SOURCES: Always include any research papers, articles, websites, or other sources you reference or review. Include URLs, DOIs, or citations in the sources array.

The user has been building a research document. Here are the most relevant sections from their document (retrieved using semantic search, not the full document):

{document_context}

NOTE: Only relevant document sections are shown above based on semantic similarity to the user's query. If you need information from other parts of the document, ask the user or indicate what additional context might be needed.

{structure_summary}

SEMANTIC SECTION MATCHING FOR CONTENT GENERATION:
When the user asks to add content to an existing section (e.g., "add paragraphs to Introduction" or "add a table to Methodology"), you should:
1. Look through the document structure above to understand the context
2. Match semantically - "Introduction" matches "intro", "Introduction", "INTRODUCTION", etc.
3. "Methods" matches "Methodology", "Methods", "Experimental Methods", etc.
4. "Results" matches "Results", "Findings", "Experimental Results", etc.
5. If adding to an existing section, set parent_id in document_structure elements to that section's ID
6. DO NOT include the section title/header in document_content when adding to existing sections - only include the NEW content
7. DO NOT create a new section element if the user is adding content to an existing one

ATTACHED SECTIONS:
If the user has attached specific sections from the document to this message, they will appear below. Use these attached sections as the primary context for your response, rather than the entire document:

{attached_markdown if attached_markdown else "No sections attached - use the full document context above."}

AVAILABLE DOCUMENT TYPES:
{types_list}

CREATING NEW TYPES:
If you need a document element type that doesn't exist in the list above, use the create_document_type function to create it. For example:
- If you need to represent mathematical equations: create type "equation"
- If you need to represent diagrams: create type "diagram"  
- If you need to represent footnotes: create type "footnote"
- If you need to represent definitions: create type "definition"

Only create new types when absolutely necessary - first check if an existing type can be used.

CRITICAL: AFTER FUNCTION CALLS:
- Function calls (like create_document_type) are just TOOLS to help you complete the task
- After making a function call, you MUST ALWAYS provide the actual response content
- Function calls do NOT complete the user's request - you must still generate document_content if the user asked for content
- If the user asked you to add content to the document, you MUST provide document_content even after making function calls
- Never return empty content after function calls - always provide the full response the user requested

DOCUMENT STRUCTURE REQUIREMENTS:
When adding document_content, you MUST provide a "document_structure" array that breaks down the content into granular, selectable elements. Each element should have:

- id: Hierarchical/positional identifier (e.g., "sec-introduction", "para-1", "para-2", "table-1", "code-1"). This reflects position in the document. The backend will automatically assign immutable UUIDs for tracking - you only need to provide the hierarchical ID.
- type: One of the available types listed above (or a new type you create)
- content: The markdown content for this element
- parent_id: ID of parent element (null for top-level sections, or section ID if adding to existing section)
- metadata: Object with additional info matching the type's metadata schema:
  - For code_block: {{"language": "python"}}
  - For image: {{"alt": "description", "url": "image-url"}}
  - For table: {{"caption": "optional caption"}}
  - For section/subsection: {{"title": "Section Title", "level": 1-6}}

STRUCTURE HIERARCHY:
- Sections (##) are top-level (parent_id: null)
- Subsections (###) have parent_id pointing to their section
- Paragraphs, tables, code blocks, etc. have parent_id pointing to their section/subsection
- Maintain logical nesting: sections > subsections > content elements

PARAGRAPH GRANULARITY:
- EACH paragraph must be a separate element in document_structure
- Do NOT combine multiple paragraphs into a single element
- Each paragraph should have its own id, type="paragraph", and parent_id
- This allows users to select individual paragraphs for attachment
- Example: If a section has 3 paragraphs, create 3 separate paragraph elements, each with parent_id pointing to the section

MARKDOWN FORMATTING GUIDELINES:
- Use headers: # for main title, ## for sections, ### for subsections
- Use **bold** for emphasis and *italic* for subtle emphasis
- Use bullet points (-) or numbered lists (1.) for lists
- Use code blocks with language tags: ```python for code examples (ALWAYS include language tag)
- Use tables with Markdown table syntax: | Column 1 | Column 2 |\n|--------|----------|\n| Value 1 | Value 2 |
- Use > for blockquotes when citing sources
- Use [link text](url) for references
- Keep paragraphs separated by blank lines

EXAMPLES:
- For a new section: "## Methodology\n\nThis study employs..."
- For code: "```python\ndef function():\n    pass\n```"
- For tables: "| Method | Accuracy |\n|--------|----------|\n| A | 95% |\n| B | 87% |"
- For lists: "- Item 1\n- Item 2\n- Item 3"

IMPORTANT RULES:
- If the user asks a question or wants to discuss something, set document_content to empty string ''
- Only include document_content when explicitly asked to add/update/write content to the document
- For code snippets in document_content, ALWAYS use proper markdown code blocks with language tags
- For tables in document_content, ALWAYS include header separator row (|--------|)
- Chat message should NEVER contain full document content - only brief snippets if relevant to answer
- ALWAYS include sources you reference, review, or cite in the sources array (NOT in document_content)
- Sources should ONLY appear in the "sources" JSON field - NEVER include URLs or citations in document_content
- The document_content should be clean research writing without source URLs or citations

CRITICAL JSON FORMATTING RULES:
- You MUST respond with valid JSON only - no extra text before or after
- ALL newlines within string values MUST be escaped as \\n (backslash followed by n)
- ALL quotes within string values MUST be escaped as \\" (backslash followed by quote)
- ALL backslashes within string values MUST be escaped as \\\\ (double backslash)
- Do NOT include actual newline characters inside JSON string values
- The JSON must be on a single line OR properly formatted with escaped newlines
- Example of CORRECT format: {{"message": "Hello\\nWorld", "document_content": "## Section\\n\\nContent", "sources": ["https://example.com"]}}
- Example of WRONG format: {{"message": "Hello
World"}} - this will break JSON parsing

CRITICAL: CONTENT GENERATION ONLY - NO PLACEMENT
- Your ONLY job is to generate high-quality research content
- Do NOT provide placement instructions or decide where content should go
- Do NOT include a "placement" field in your response
- Focus on generating well-structured, accurate, properly formatted content
- When adding to an existing section, ONLY include the NEW content (no section headers, no existing content)

Always respond in JSON format with exactly these keys:
{{
  "message": "your conversational response here (always provide this, even if brief). Use \\n for line breaks.",
  "document_content": "structured markdown content to add (empty string '' if no document update needed). Use \\n for line breaks. IMPORTANT: When adding to an existing section, ONLY include the NEW content - do NOT repeat the section header or existing content.",
  "document_structure": [array of structured elements matching document_content. Empty array [] if no document update needed],
  "sources": ["array of source URLs, DOIs, or citations you referenced or reviewed. Empty array [] if no sources"]
}}

CRITICAL: CONTENT SCOPE RULES
- When adding content to an EXISTING section: document_content should ONLY contain the new paragraphs/tables/content you are adding
- DO NOT include section headers (## Section Name) when adding to existing sections
- DO NOT repeat existing paragraphs or content that's already in the document
- Only include what is NEW and being added in this response
- Example: If user says "Add a paragraph to Introduction" and Introduction already exists:
  * WRONG: "## Introduction\\n\\nExisting paragraph text...\\n\\nNew paragraph text..."
  * CORRECT: "New paragraph text about recent innovations..."
  * The document_structure should have parent_id pointing to the existing Introduction section ID

Remember: The chat message should be conversational and helpful. The document_content should be formal research writing in Markdown format, but ONLY include new content being added. The document_structure should provide granular, selectable elements that match the document_content. Sources should include any papers, articles, or websites you mention or review. You generate content only - placement decisions are made separately."""
        else:
            # No existing document content, but structure_summary is already initialized above
            # Prepare attached sections markdown for context (if any)
            attached_markdown_for_prompt = ''
            if attached_sections:
                attached_contents = [section.get('content', '') for section in attached_sections if section.get('content')]
                attached_markdown_for_prompt = '\n\n'.join(attached_contents)
            
            # Stage 1 AI System Prompt - Content Generation Only (No Placement) - No Existing Document
            system_message = f"""You are a research assistant helping users write research papers. Your role is to GENERATE CONTENT ONLY - you do NOT decide where content should be placed in the document.

CRITICAL: UNDERSTANDING CURRENT VS HISTORICAL CONTEXT
- You will receive conversation history for context, but you MUST ONLY respond to the CURRENT USER MESSAGE (the last message)
- Historical messages are provided so you understand what was discussed previously, but you should NOT act on old instructions
- Only the CURRENT USER MESSAGE contains the instruction you need to fulfill RIGHT NOW
- If the conversation history shows previous requests, those have already been completed - do NOT repeat them
- Focus ONLY on what the current user message is asking for

You have two distinct responsibilities:

1. CHAT MESSAGE: Provide conversational, helpful responses focused on reasoning, answering questions, discussing ideas. Be concise and conversational - this is for the chat interface.

2. DOCUMENT CONTENT GENERATION: When the user's request requires adding or updating the research document, generate well-structured, formal research content in Markdown format. Your ONLY job is to generate high-quality content - you do NOT provide placement instructions or decide where content goes.

3. DOCUMENT STRUCTURE: When providing document_content, you MUST also provide a structured representation in the "document_structure" field. This allows users to select and attach specific sections, paragraphs, tables, or code snippets.

4. SOURCES: Always include any research papers, articles, websites, or other sources you reference or review. Include URLs, DOIs, or citations in the sources array.

{structure_summary}

SEMANTIC SECTION MATCHING FOR CONTENT GENERATION:
When the user asks to add content to an existing section (e.g., "add paragraphs to Introduction" or "add a table to Methodology"), you should:
1. Look through the document structure above to understand the context
2. Match semantically - "Introduction" matches "intro", "Introduction", "INTRODUCTION", etc.
3. "Methods" matches "Methodology", "Methods", "Experimental Methods", etc.
4. "Results" matches "Results", "Findings", "Experimental Results", etc.
5. If adding to an existing section, set parent_id in document_structure elements to that section's ID
6. DO NOT include the section title/header in document_content when adding to existing sections - only include the NEW content
7. DO NOT create a new section element if the user is adding content to an existing one

ATTACHED SECTIONS:
If the user has attached specific sections from the document to this message, they will appear below. Use these attached sections as the primary context for your response, rather than the entire document:

{attached_markdown_for_prompt if attached_markdown_for_prompt else "No sections attached - use the full document context above."}

AVAILABLE DOCUMENT TYPES:
{types_list}

CREATING NEW TYPES:
If you need a document element type that doesn't exist in the list above, use the create_document_type function to create it. For example:
- If you need to represent mathematical equations: create type "equation"
- If you need to represent diagrams: create type "diagram"  
- If you need to represent footnotes: create type "footnote"
- If you need to represent definitions: create type "definition"

Only create new types when absolutely necessary - first check if an existing type can be used.

CRITICAL: AFTER FUNCTION CALLS:
- Function calls (like create_document_type) are just TOOLS to help you complete the task
- After making a function call, you MUST ALWAYS provide the actual response content
- Function calls do NOT complete the user's request - you must still generate document_content if the user asked for content
- If the user asked you to add content to the document, you MUST provide document_content even after making function calls
- Never return empty content after function calls - always provide the full response the user requested

DOCUMENT STRUCTURE REQUIREMENTS:
When adding document_content, you MUST provide a "document_structure" array that breaks down the content into granular, selectable elements. Each element should have:

- id: Hierarchical/positional identifier (e.g., "sec-introduction", "para-1", "para-2", "table-1", "code-1"). This reflects position in the document. The backend will automatically assign immutable UUIDs for tracking - you only need to provide the hierarchical ID.
- type: One of the available types listed above (or a new type you create)
- content: The markdown content for this element
- parent_id: ID of parent element (null for top-level sections, or section ID if adding to existing section)
- metadata: Object with additional info matching the type's metadata schema:
  - For code_block: {{"language": "python"}}
  - For image: {{"alt": "description", "url": "image-url"}}
  - For table: {{"caption": "optional caption"}}
  - For section/subsection: {{"title": "Section Title", "level": 1-6}}

STRUCTURE HIERARCHY:
- Sections (##) are top-level (parent_id: null)
- Subsections (###) have parent_id pointing to their section
- Paragraphs, tables, code blocks, etc. have parent_id pointing to their section/subsection
- Maintain logical nesting: sections > subsections > content elements

PARAGRAPH GRANULARITY:
- EACH paragraph must be a separate element in document_structure
- Do NOT combine multiple paragraphs into a single element
- Each paragraph should have its own id, type="paragraph", and parent_id
- This allows users to select individual paragraphs for attachment
- Example: If a section has 3 paragraphs, create 3 separate paragraph elements, each with parent_id pointing to the section

MARKDOWN FORMATTING GUIDELINES:
- Use headers: # for main title, ## for sections, ### for subsections
- Use **bold** for emphasis and *italic* for subtle emphasis
- Use bullet points (-) or numbered lists (1.) for lists
- Use code blocks with language tags: ```python for code examples (ALWAYS include language tag)
- Use tables with Markdown table syntax: | Column 1 | Column 2 |\n|--------|----------|\n| Value 1 | Value 2 |
- Use > for blockquotes when citing sources
- Use [link text](url) for references
- Keep paragraphs separated by blank lines

EXAMPLES:
- For a new section: "## Methodology\n\nThis study employs..."
- For code: "```python\ndef function():\n    pass\n```"
- For tables: "| Method | Accuracy |\n|--------|----------|\n| A | 95% |\n| B | 87% |"
- For lists: "- Item 1\n- Item 2\n- Item 3"

IMPORTANT RULES:
- If the user asks a question or wants to discuss something, set document_content to empty string ''
- Only include document_content when explicitly asked to add/update/write content to the document
- For code snippets in document_content, ALWAYS use proper markdown code blocks with language tags
- For tables in document_content, ALWAYS include header separator row (|--------|)
- Chat message should NEVER contain full document content - only brief snippets if relevant to answer
- ALWAYS include sources you reference, review, or cite in the sources array (NOT in document_content)
- Sources should ONLY appear in the "sources" JSON field - NEVER include URLs or citations in document_content
- The document_content should be clean research writing without source URLs or citations

CRITICAL JSON FORMATTING RULES:
- You MUST respond with valid JSON only - no extra text before or after
- ALL newlines within string values MUST be escaped as \\n (backslash followed by n)
- ALL quotes within string values MUST be escaped as \\" (backslash followed by quote)
- ALL backslashes within string values MUST be escaped as \\\\ (double backslash)
- Do NOT include actual newline characters inside JSON string values
- The JSON must be on a single line OR properly formatted with escaped newlines
- Example of CORRECT format: {{"message": "Hello\\nWorld", "document_content": "## Section\\n\\nContent", "sources": ["https://example.com"]}}
- Example of WRONG format: {{"message": "Hello
World"}} - this will break JSON parsing

CRITICAL: CONTENT GENERATION ONLY - NO PLACEMENT
- Your ONLY job is to generate high-quality research content
- Do NOT provide placement instructions or decide where content should go
- Do NOT include a "placement" field in your response
- Focus on generating well-structured, accurate, properly formatted content
- When adding to an existing section, ONLY include the NEW content (no section headers, no existing content)

Always respond in JSON format with exactly these keys:
{{
  "message": "your conversational response here (always provide this, even if brief). Use \\n for line breaks.",
  "document_content": "structured markdown content to add (empty string '' if no document update needed). Use \\n for line breaks. IMPORTANT: When adding to an existing section, ONLY include the NEW content - do NOT repeat the section header or existing content.",
  "document_structure": [array of structured elements matching document_content. Empty array [] if no document update needed],
  "sources": ["array of source URLs, DOIs, or citations you referenced or reviewed. Empty array [] if no sources"]
}}

CRITICAL: CONTENT SCOPE RULES
- When adding content to an EXISTING section: document_content should ONLY contain the new paragraphs/tables/content you are adding
- DO NOT include section headers (## Section Name) when adding to existing sections
- DO NOT repeat existing paragraphs or content that's already in the document
- Only include what is NEW and being added in this response
- Example: If user says "Add a paragraph to Introduction" and Introduction already exists:
  * WRONG: "## Introduction\\n\\nExisting paragraph text...\\n\\nNew paragraph text..."
  * CORRECT: "New paragraph text about recent innovations..."
  * The document_structure should have parent_id pointing to the existing Introduction section ID

Remember: The chat message should be conversational and helpful. The document_content should be formal research writing in Markdown format, but ONLY include new content being added. The document_structure should provide granular, selectable elements that match the document_content. Sources should include any papers, articles, or websites you mention or review. You generate content only - placement decisions are made separately."""
        
        # Define function for creating new document types
        create_type_function = {
            "name": "create_document_type",
            "description": "Create a new document element type when no existing type matches the content structure needed. Use this when you need a type that doesn't exist in the available types list.",
            "parameters": {
                "type": "object",
                "properties": {
                    "type_name": {
                        "type": "string",
                        "description": "Unique name for the new type (lowercase, underscore-separated, e.g., 'equation', 'diagram', 'footnote')"
                    },
                    "description": {
                        "type": "string",
                        "description": "Human-readable description of what this type represents and when to use it"
                    },
                    "metadata_schema": {
                        "type": "object",
                        "description": "JSON schema defining expected metadata fields for this type (e.g., {'language': 'string'} for code, {'caption': 'string'} for images)",
                        "additionalProperties": True
                    }
                },
                "required": ["type_name", "description"]
            }
        }
        
        # Check for pending content (for revisions)
        pending_content_data = ChatSessionModel.get_pending_content(session_id)
        is_revision = pending_content_data is not None
        
        # If there's pending content, modify system message to include revision context
        if is_revision and pending_content_data:
            previous_content = pending_content_data['pending_content'].get('document_content', '')
            previous_structure = pending_content_data['pending_content'].get('document_structure', [])
            previous_sources = pending_content_data['pending_content'].get('sources', [])
            revision_context = f"""

CRITICAL: The user has pending content awaiting approval. They are now requesting changes or revisions to specific parts.

PREVIOUS PENDING CONTENT (you MUST keep all of this unless explicitly asked to change it):
{previous_content}

PREVIOUS PENDING STRUCTURE:
{json.dumps(previous_structure, indent=2) if previous_structure else "None"}

PREVIOUS PENDING SOURCES:
{json.dumps(previous_sources, indent=2) if previous_sources else "[]"}

CRITICAL REVISION RULES - YOU MUST FOLLOW THESE EXACTLY:
1. The user's current message may ask to modify ONLY a specific part (e.g., "append the table", "change the table", "update paragraph 2")
2. You MUST keep ALL other content from the previous pending content exactly as it was
3. Only modify the specific part the user is asking to change
4. If the user asks to change/append a table, keep all sections, paragraphs, and other content - only modify/append the table
5. If the user asks to change a paragraph, keep all other paragraphs, sections, tables - only modify that paragraph
6. **MOST IMPORTANT**: You MUST return the COMPLETE content including BOTH unchanged parts AND modified parts
7. Your document_content MUST include ALL content: unchanged parts + modified parts (in the correct order)
8. Your document_structure MUST include ALL elements: unchanged elements + modified elements (with correct IDs and parent_ids)
9. Your sources array MUST include ALL sources: previous sources + any new sources you reference

Example: If previous content had Introduction section + Background section + Table, and user says "append the table", 
you should return: Introduction section (unchanged) + Background section (unchanged) + Original Table (unchanged) + New Table (appended).

DO NOT return only the modified part. DO NOT return only the new part. You MUST return the COMPLETE content with everything included.
"""
            system_message = system_message + revision_context
        
        # Get conversation history
        messages = ChatSessionModel.get_messages(session_id)
        
        # Convert to OpenAI format with clear separation of current vs historical
        # Note: attached sections are already included in the user message content
        openai_messages = [
            {'role': 'system', 'content': system_message}
        ]
        
        # Add all messages, but mark the current one clearly
        # The last user message is always the current instruction
        for i, msg in enumerate(messages):
            content = msg['content']
            
            # Find the last user message - that's the current instruction
            last_user_msg_index = None
            for j in range(len(messages) - 1, -1, -1):
                if messages[j]['role'] == 'user':
                    last_user_msg_index = j
                    break
            
            # If this is the current instruction (last user message), mark it clearly
            if i == last_user_msg_index and msg['role'] == 'user':
                content = f"[CURRENT INSTRUCTION - RESPOND TO THIS ONLY]\n\n{content}\n\n[END OF CURRENT INSTRUCTION]\n\nIMPORTANT: This is the ONLY message you should act on. All previous messages are historical context only."
            elif i < last_user_msg_index or (i > last_user_msg_index and msg['role'] == 'assistant'):
                # Historical messages - add context marker
                content = f"[HISTORICAL CONTEXT - DO NOT ACT ON THIS - FOR REFERENCE ONLY]\n\n{content}\n\n[END OF HISTORICAL CONTEXT]"
            
            openai_messages.append({
                'role': msg['role'],
                'content': content
            })
        
        # Get AI response with function calling support
        functions = [create_type_function]
        try:
            ai_response = openai_service.chat_completion(
                openai_messages, 
                functions=functions,
                function_call="auto"
            )
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            import traceback
            traceback.print_exc()
            raise
        
        # Ensure ai_response is a dict
        if not isinstance(ai_response, dict):
            print(f"Unexpected ai_response type: {type(ai_response)}")
            ai_response = {'content': str(ai_response) if ai_response else '', 'function_call': None}
        
        # Handle function calls
        function_calls_made = []
        max_iterations = 5  # Prevent infinite loops
        iteration = 0
        
        function_call = ai_response.get('function_call')
        while function_call and iteration < max_iterations:
            iteration += 1
            
            # Handle function_call object (OpenAI API format)
            # OpenAI returns a FunctionCall object with .name and .arguments attributes
            # .arguments is a JSON string that needs to be parsed
            func_name = None
            func_args = '{}'
            try:
                if hasattr(function_call, 'name'):
                    func_name = function_call.name
                    func_args = function_call.arguments if hasattr(function_call, 'arguments') else '{}'
                elif isinstance(function_call, dict):
                    func_name = function_call.get('name')
                    func_args = function_call.get('arguments', '{}')
                else:
                    print(f"Unknown function_call format: {type(function_call)}")
                    break
            except Exception as e:
                print(f"Error parsing function_call: {e}")
                import traceback
                traceback.print_exc()
                break
            
            if not func_name:
                print("No function name found in function_call")
                break
            
            if func_name == 'create_document_type':
                # Parse function arguments
                try:
                    args = json.loads(func_args) if isinstance(func_args, str) else func_args
                    type_name = args.get('type_name')
                    description = args.get('description')
                    metadata_schema = args.get('metadata_schema', {})
                    
                    # Create the new type
                    type_id = DocumentTypeModel.create_type(
                        type_name=type_name,
                        description=description,
                        metadata_schema=metadata_schema,
                        is_system=False
                    )
                    
                    if type_id:
                        function_result = {
                            "success": True,
                            "message": f"Successfully created new document type '{type_name}'",
                            "type_id": type_id
                        }
                        # Update available types
                        available_types = DocumentTypeModel.get_all_types()
                        type_names = [t['type_name'] for t in available_types]
                        type_descriptions[type_name] = description
                    else:
                        function_result = {
                            "success": False,
                            "message": f"Type '{type_name}' already exists"
                        }
                    
                    function_calls_made.append({
                        "function": "create_document_type",
                        "arguments": args,
                        "result": function_result
                    })
                    
                    # Add function call and result to conversation
                    openai_messages.append({
                        'role': 'assistant',
                        'content': None,
                        'function_call': {
                            'name': func_name,
                            'arguments': json.dumps(args) if isinstance(args, dict) else func_args
                        }
                    })
                    openai_messages.append({
                        'role': 'function',
                        'name': func_name,
                        'content': json.dumps(function_result)
                    })
                    
                    # Add a reminder that the AI must still provide the actual response
                    # This helps ensure content is generated after function calls
                    reminder_message = {
                        'role': 'user',
                        'content': 'Remember: The function call was just a tool. You must still provide the actual response content that the user requested. If the user asked for document content, you must generate document_content with document_structure and placement information.'
                    }
                    openai_messages.append(reminder_message)
                    
                    # Get next response
                    try:
                        ai_response = openai_service.chat_completion(
                            openai_messages,
                            functions=functions,
                            function_call="auto"
                        )
                        # Ensure ai_response is a dict
                        if not isinstance(ai_response, dict):
                            ai_response = {'content': str(ai_response) if ai_response else '', 'function_call': None}
                        function_call = ai_response.get('function_call')
                    except Exception as e:
                        print(f"Error calling OpenAI API in function loop: {e}")
                        import traceback
                        traceback.print_exc()
                        break
                except Exception as e:
                    print(f"Error handling function call: {e}")
                    import traceback
                    traceback.print_exc()
                    # Break on error
                    break
            else:
                # Unknown function
                print(f"Unknown function: {func_name}")
                break
        
        # Parse JSON response from final content
        ai_response_content = ai_response.get('content') or ''
        
        # If no content after function calls, make another API call without function calling
        # to force the AI to generate the actual response content
        if not ai_response_content and function_calls_made:
            print("DEBUG: Function calls made but no content returned. Making follow-up call without function calling.")
            try:
                # Make one more call without function calling to get actual content
                follow_up_response = openai_service.chat_completion(
                    openai_messages,
                    functions=None,  # Disable function calling
                    function_call="none"
                )
                ai_response_content = follow_up_response.get('content') or ''
                if ai_response_content:
                    print(f"DEBUG: Got content from follow-up call: {len(ai_response_content)} chars")
                else:
                    print("DEBUG: Follow-up call also returned no content")
            except Exception as e:
                print(f"DEBUG: Error in follow-up API call: {e}")
                import traceback
                traceback.print_exc()
        
        # If still no content, create a fallback response
        if not ai_response_content:
            # No content - this shouldn't happen, but handle it
            ai_response_content = json.dumps({
                "message": "I apologize, but I didn't receive a proper response. Please try again.",
                "document_content": "",
                "document_structure": [],
                "placement": None,
                "sources": []
            })
        
        parsed_response = openai_service.parse_json_response(ai_response_content)
        
        # Log parsed response (without raw content)
        print("DEBUG: Parsed Response:")
        print(f"  - message length: {len(parsed_response.get('message', ''))}")
        print(f"  - document_content length: {len(parsed_response.get('document_content', ''))}")
        print(f"  - document_structure count: {len(parsed_response.get('document_structure', []))}")
        print(f"  - placement: {parsed_response.get('placement')}")
        print(f"  - sources count: {len(parsed_response.get('sources', []))}")
        if parsed_response.get('document_content'):
            print(f"  - document_content preview: {parsed_response.get('document_content', '')[:200]}...")
        if parsed_response.get('document_structure'):
            print(f"  - document_structure: {json.dumps(parsed_response.get('document_structure', []), indent=2)}")
        print("=" * 80)
        
        chat_message = parsed_response.get('message', '')
        document_content_to_add = parsed_response.get('document_content', '')
        document_structure = parsed_response.get('document_structure', [])
        sources = parsed_response.get('sources', [])
        
        # Don't extract placement instructions in backend - let Stage 2 AI figure it out from user messages
        
        # Determine status
        status = None
        pending_content_id = None
        
        if document_content_to_add.strip():
            # Content generated - store as pending
            status = "pending_approval"
            
            # Trust the AI to return complete content (including unchanged parts for revisions)
            # The revision context in the system prompt explicitly instructs the AI to return complete content
            print(f"DEBUG: Storing pending content from AI response")
            print(f"  - Content length: {len(document_content_to_add)}")
            print(f"  - Structure count: {len(document_structure)}")
            print(f"  - Sources count: {len(sources)}")
            if is_revision and pending_content_data:
                previous_pending = pending_content_data['pending_content']
                previous_content = previous_pending.get('document_content', '')
                previous_sources = previous_pending.get('sources', [])
                print(f"  - Previous content length: {len(previous_content)}")
                print(f"  - Is revision: True - trusting AI to return complete content")
                # Merge sources (combine previous sources with new sources)
                merged_sources = list(set(previous_sources + sources))
            else:
                merged_sources = sources
            
            # Store AI response as-is (AI is responsible for including all content)
            # Track session start timestamp (when user first requested content)
            # For revisions, keep the original session start timestamp
            session_start_timestamp = None
            if is_revision and pending_content_data:
                # Keep original session start timestamp
                session_start_timestamp = pending_content_data['pending_content'].get('session_start_timestamp')
            else:
                # New session starts with the user message that triggered this content generation
                # Find the last user message (the one that triggered this generation)
                all_messages = ChatSessionModel.get_messages(session_id)
                last_user_message = None
                for msg in reversed(all_messages):
                    if msg.get('role') == 'user':
                        last_user_message = msg
                        break
                
                if last_user_message and last_user_message.get('timestamp'):
                    # Use the timestamp of the user message that started this session
                    msg_timestamp = last_user_message.get('timestamp')
                    if isinstance(msg_timestamp, str):
                        session_start_timestamp = msg_timestamp
                    else:
                        session_start_timestamp = msg_timestamp.isoformat()
                else:
                    # Fallback: use current time if we can't find the user message
                    session_start_timestamp = datetime.utcnow().isoformat()
                    print(f"WARNING: Could not find user message timestamp, using current time")
            
            pending_content_data_to_store = {
                'document_content': document_content_to_add,
                'document_structure': document_structure,
                'sources': merged_sources,
                'session_start_timestamp': session_start_timestamp,  # Track when this session started
                'timestamp': datetime.utcnow().isoformat()
            }
            
            pending_content_id = ChatSessionModel.update_pending_content(session_id, pending_content_data_to_store)
            print(f"DEBUG: Stored pending content with ID: {pending_content_id}")
            
            # Store message with pending status
            ChatSessionModel.add_message(
                session_id, 
                'assistant', 
                chat_message, 
                sources=sources,
                document_content=document_content_to_add,
                document_structure=document_structure if document_structure else None,
                placement=None,  # No placement in Stage 1
                status=status,
                pending_content_id=pending_content_id
            )
        else:
            # No content - regular chat message
            ChatSessionModel.add_message(
                session_id, 
                'assistant', 
                chat_message, 
                sources=sources,
                document_content=None,
                document_structure=None,
                placement=None,
                status=None
            )
        
        # DO NOT auto-insert content - it's now pending approval
        # Content will be inserted when user approves via /chat/approve endpoint
        
        print(f"DEBUG: document_content_to_add exists: {bool(document_content_to_add.strip())}")
        print(f"DEBUG: document_structure exists: {bool(document_structure)}")
        print(f"DEBUG: status: {status}")
        print(f"DEBUG: pending_content_id: {pending_content_id}")
        
        if False:  # Disabled auto-insertion - content is now pending approval
            try:
                session_dir = get_session_dir(session_id)
                doc_path = session_dir / 'doc.md'
                
                # Ensure directory exists
                os.makedirs(session_dir, exist_ok=True)
                
                # For fresh documents, auto-append (no placement needed)
                if is_fresh_document:
                    # Fresh document - just add content
                    with open(doc_path, 'w', encoding='utf-8') as f:
                        f.write(document_content_to_add)
                    
                    # Store structure if provided
                    if document_structure:
                        DocumentModel.update_document_structure(session_id, document_structure, user_id)
                        print(f"Fresh document: Added {len(document_structure)} elements")
                    else:
                        print("Fresh document: Added content but no structure provided")
                
                # Use smart insertion based on placement instructions for existing documents
                elif placement and document_structure and document_structure_tree and document_structure_tree.get('roots'):
                    # Insert new structure into existing tree
                    updated_tree = DocumentStructureService.insert_structure(
                        document_structure_tree,
                        document_structure,
                        placement
                    )
                    
                    # Flatten tree back to list for storage
                    updated_structure_flat = DocumentStructureService.flatten_tree(updated_tree)
                    
                    # Generate markdown from updated tree
                    updated_markdown = DocumentStructureService.tree_to_markdown(updated_tree)
                    
                    # Write updated markdown to file
                    with open(doc_path, 'w', encoding='utf-8') as f:
                        f.write(updated_markdown)
                    
                    # Update structure in database
                    DocumentModel.update_document_structure(session_id, updated_structure_flat, user_id)
                    
                else:
                    # Fallback: handle cases where placement is missing or structure is empty
                    print("DEBUG: Using fallback insertion logic")
                    
                    if not placement:
                        placement = {'strategy': 'insert_at_end', 'target_id': None}
                        print("DEBUG: No placement provided, using insert_at_end")
                    
                    # Check if we have existing structure
                    has_existing_structure = (
                        document_structure_tree and 
                        document_structure_tree.get('roots') and 
                        len(document_structure_tree.get('roots', [])) > 0
                    )
                    
                    if not has_existing_structure:
                        # No existing structure - create new tree or append to file
                        if document_structure:
                            document_structure_tree = DocumentStructureService.build_tree(document_structure)
                            updated_structure_flat = document_structure
                            updated_markdown = DocumentStructureService.tree_to_markdown(document_structure_tree)
                        else:
                            # No structure provided - just append content to file
                            print("DEBUG: No structure, appending content directly")
                            with open(doc_path, 'a', encoding='utf-8') as f:
                                if os.path.exists(doc_path) and os.path.getsize(doc_path) > 0:
                                    f.write('\n\n')
                                f.write(document_content_to_add)
                            updated_structure_flat = []
                            updated_markdown = None
                    else:
                        # Insert into existing tree
                        if document_structure:
                            updated_tree = DocumentStructureService.insert_structure(
                                document_structure_tree,
                                document_structure,
                                placement
                            )
                            updated_structure_flat = DocumentStructureService.flatten_tree(updated_tree)
                            updated_markdown = DocumentStructureService.tree_to_markdown(updated_tree)
                        else:
                            # No structure but have existing structure - just append content
                            print("DEBUG: No new structure, appending content to existing document")
                            with open(doc_path, 'a', encoding='utf-8') as f:
                                f.write('\n\n')
                                f.write(document_content_to_add)
                            updated_structure_flat = document_structure_flat  # Keep existing
                            updated_markdown = None
                    
                    # Write to file if markdown was generated
                    if updated_markdown is not None:
                        with open(doc_path, 'w', encoding='utf-8') as f:
                            f.write(updated_markdown)
                        print(f"DEBUG: Wrote markdown from structure ({len(updated_structure_flat)} elements)")
                    
                    # Update structure in database if we have structure
                    if updated_structure_flat:
                        DocumentModel.update_document_structure(session_id, updated_structure_flat, user_id)
                        print(f"DEBUG: Updated structure in database")
                
                # Re-index document after update (for semantic search)
                try:
                    if os.path.exists(doc_path):
                        with open(doc_path, 'r', encoding='utf-8') as f:
                            updated_content = f.read()
                        vector_service.index_document(session_id, updated_content)
                except Exception as index_error:
                    # Log but don't fail if indexing fails
                    print(f"Warning: Failed to re-index document: {index_error}")
            except Exception as doc_error:
                # Log error but don't fail the request if document write fails
                import traceback
                print(f"Warning: Failed to write document content: {doc_error}")
                traceback.print_exc()
        
        response_data = {
            'response': chat_message,
            'document_content': document_content_to_add,
            'document_structure': document_structure,
            'sources': sources,
            'session_id': session_id,
            'function_calls': function_calls_made if function_calls_made else None
        }
        
        # Add pending approval fields if content was generated
        if status == "pending_approval":
            response_data['status'] = status
            response_data['pending_content_id'] = pending_content_id
        
        return jsonify(response_data), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in send_message: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500

@chat_bp.route('/approve', methods=['POST'])
def approve_content():
    """Approve pending content and place it in the document using Stage 2 AI"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        session_id = data.get('session_id')
        document_id = data.get('document_id')  # New: document_id for research documents
        pending_content_id = data.get('pending_content_id')
        edited_content = data.get('edited_content')  # Optional edited content
        
        if not session_id or not pending_content_id:
            return jsonify({'error': 'session_id and pending_content_id are required'}), 400
        
        # Verify session belongs to user
        session = ChatSessionModel.get_session(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        if session['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get pending content
        pending_data = ChatSessionModel.get_pending_content(session_id)
        if not pending_data or pending_data['pending_content_id'] != pending_content_id:
            return jsonify({'error': 'Pending content not found or already processed'}), 404
        
        pending_content = pending_data['pending_content']
        
        # Use edited content if provided, otherwise use original
        # If edited_content is provided, we need to merge it with the original structure
        original_content = pending_content.get('document_content', '')
        original_structure = pending_content.get('document_structure', [])
        
        if edited_content:
            # User edited specific content - we need to merge edited content with original structure
            # The edited_content is the markdown text the user edited
            # We need to update the corresponding elements in document_structure
            
            # For now, we'll use the edited content as-is and try to preserve structure
            # The Stage 2 AI will handle proper placement
            content_to_place = edited_content
            
            # Try to update structure elements that match edited content
            # This is a simplified approach - ideally we'd parse the edited markdown and match to structure
            # For now, we'll use the original structure and let Stage 2 AI handle it
            document_structure = original_structure
            print(f"DEBUG: Using edited content (length: {len(edited_content)}), preserving original structure")
        else:
            content_to_place = original_content
            document_structure = original_structure
        
        # Get session start timestamp to collect all user messages in this session
        session_start_timestamp = pending_content.get('session_start_timestamp')
        
        # Collect ALL user messages from this session (from session_start_timestamp until now)
        all_messages = ChatSessionModel.get_messages(session_id)
        session_user_messages = []
        
        if session_start_timestamp:
            # Parse session start timestamp
            try:
                # Parse ISO format timestamp string
                if isinstance(session_start_timestamp, str):
                    # Handle ISO format with or without timezone
                    session_start_str = session_start_timestamp.replace('Z', '+00:00')
                    session_start_dt = datetime.fromisoformat(session_start_str)
                else:
                    # Already a datetime object
                    session_start_dt = session_start_timestamp
                
                print(f"DEBUG: Session start timestamp: {session_start_dt}")
                
                # Collect all user messages from session start onwards (inclusive)
                for msg in all_messages:
                    if msg.get('role') == 'user':
                        msg_timestamp = msg.get('timestamp')
                        if msg_timestamp:
                            # Handle both datetime objects and ISO strings
                            if isinstance(msg_timestamp, str):
                                msg_str = msg_timestamp.replace('Z', '+00:00')
                                try:
                                    msg_dt = datetime.fromisoformat(msg_str)
                                except ValueError:
                                    # Try without timezone adjustment
                                    msg_dt = datetime.fromisoformat(msg_timestamp)
                            else:
                                msg_dt = msg_timestamp
                            
                            # Include messages from session start onwards (>= means inclusive)
                            # Also include messages that are very close (within 1 second) to handle timing edge cases
                            time_diff = (msg_dt - session_start_dt).total_seconds()
                            if msg_dt >= session_start_dt or abs(time_diff) < 1.0:
                                session_user_messages.append(msg.get('content', ''))
                                print(f"DEBUG: Included user message from {msg_dt} (diff: {time_diff:.2f}s)")
                        else:
                            # Message has no timestamp - include it to be safe
                            print(f"WARNING: User message has no timestamp, including it")
                            session_user_messages.append(msg.get('content', ''))
            except Exception as e:
                print(f"WARNING: Failed to parse session start timestamp: {e}")
                import traceback
                traceback.print_exc()
                # Fallback: use all user messages
                session_user_messages = [msg.get('content', '') for msg in all_messages if msg.get('role') == 'user']
        else:
            # No session start timestamp - use all user messages (fallback)
            print(f"WARNING: No session_start_timestamp found, using all user messages")
            session_user_messages = [msg.get('content', '') for msg in all_messages if msg.get('role') == 'user']
        
        print(f"DEBUG: Collected {len(session_user_messages)} user messages from session")
        for i, msg in enumerate(session_user_messages):
            print(f"DEBUG: User message {i+1}: {msg[:100]}...")
        
        if not content_to_place.strip():
            return jsonify({'error': 'No content to place'}), 400
        
        # Get full document content and structure
        # New approach: use document_id if provided, otherwise fall back to session_id (legacy)
        document_content = ''
        document_structure_flat = []
        
        if document_id:
            # Use research document model
            document = ResearchDocumentModel.get_document(document_id)
            if not document:
                return jsonify({'error': 'Document not found'}), 404
            
            if document['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            document_content = document.get('markdown_content', '')
            document_structure_flat = document.get('structure', [])
        else:
            # Legacy approach: use session-based file storage
            session_dir = get_session_dir(session_id)
            doc_path = session_dir / 'doc.md'
            document_structure_flat = DocumentModel.get_document_structure(session_id)
            
            # Ensure document_structure_flat is a list
            if document_structure_flat and not isinstance(document_structure_flat, list):
                print(f"WARNING: document_structure_flat is not a list, got {type(document_structure_flat)}")
                document_structure_flat = []
            
            if os.path.exists(doc_path):
                with open(doc_path, 'r', encoding='utf-8') as f:
                    document_content = f.read()
        
        # Ensure document_structure_flat is a list
        if document_structure_flat and not isinstance(document_structure_flat, list):
            print(f"WARNING: document_structure_flat is not a list, got {type(document_structure_flat)}")
            document_structure_flat = []
        
        # Check if document is empty - if so, skip Stage 2 AI and just append content directly
        is_document_empty = (
            not document_content.strip() and 
            (not document_structure_flat or len(document_structure_flat) == 0)
        )
        
        if is_document_empty:
            print("DEBUG: Document is empty - skipping Stage 2 AI and appending content directly")
            # Just use the content as-is since there's nothing to merge with
            updated_document_content = content_to_place
            updated_document_structure = document_structure if document_structure else []
            placement_applied = "Content added to empty document"
            placement_explanation = "The document was empty, so the content was added as the initial content."
        else:
            # Document has content - use Stage 2 AI for placement
            # Build structure tree
            if document_structure_flat and len(document_structure_flat) > 0:
                document_structure_tree = DocumentStructureService.build_tree(document_structure_flat)
            else:
                document_structure_tree = {'elements': {}, 'roots': []}
            
            # Stage 2 AI System Prompt - Placement Specialist
            is_edited = edited_content is not None and edited_content != original_content
            edited_note = "\n\nNOTE: The user has edited the content before approving. Use the edited content provided above, but preserve the structure and placement logic." if is_edited else ""
            
            # Format all user messages from the session for Stage 2 AI
            # Let the AI figure out placement instructions from user messages - don't try to be smart in backend
            user_messages_text = ""
            if session_user_messages:
                user_messages_text = "\n\nALL USER MESSAGES FROM THIS SESSION (read through these to understand user intent and placement preferences):\n"
                for i, user_msg in enumerate(session_user_messages, 1):
                    user_messages_text += f"\n--- User Message {i} ---\n{user_msg}\n"
                user_messages_text += "\n\nCRITICAL: Read through ALL the user messages above carefully. If ANY of them specify where content should be placed (e.g., 'in introduction', 'at top of section 3', 'after background', 'at the beginning of the document'), you MUST follow that instruction EXACTLY. Only if NO placement instructions are found in any user message should you make your own decision based on document context.\n"
            
            stage2_system_prompt = f"""You are a document placement specialist. Your ONLY job is to place approved content into the research document.

CRITICAL PRIORITY ORDER (FOLLOW THIS EXACTLY):
1. FIRST PRIORITY: If user provided placement instructions in ANY of their messages below, you MUST follow them EXACTLY - no exceptions
2. SECOND PRIORITY: Only if NO placement instructions are found in ANY user message, place content in the most logical location based on document context

{user_messages_text}

CRITICAL RULES:
- Preserve ALL existing document content word-for-word
- Do NOT rewrite, modify, or rephrase existing document content
- Only add/insert the new approved content as instructed
- Maintain document structure integrity
- Preserve all formatting, spacing, and structure
- Return valid JSON only - no markdown, no extra text
- Look through ALL user messages above to find placement instructions (e.g., "in introduction", "at top of section 3", "after background")
- If placement instructions are found in ANY user message, follow them EXACTLY. Only make your own decision if NO instructions are found in any message.

Current document content (DO NOT MODIFY THIS):
{document_content}

Content to place (this is the NEW content to add):
{content_to_place}
{edited_note}

PLACEMENT INSTRUCTION INTERPRETATION GUIDE:
- "insert_into" with position "beginning": Place content at the very start of the target section (right after section header)
- "insert_into" with position "end": Place content at the very end of the target section (after all existing content in that section)
- "insert_after": Place content immediately after the target element (as a new section/block)
- "insert_before": Place content immediately before the target element (as a new section/block)
- "insert_at_end": Place content at the very end of the entire document

Current document structure:
{json.dumps(document_structure_flat, indent=2) if document_structure_flat else "No existing structure"}

New content structure (for the content being placed):
{json.dumps(document_structure, indent=2) if document_structure else "No structure provided"}

You MUST return valid JSON with exactly these fields:
{{
  "updated_document_content": "full markdown document with ALL existing content preserved exactly + new content placed appropriately",
  "updated_document_structure": [array of ALL structure elements - existing + new],
  "placement_applied": "brief description of where content was placed (e.g., 'Content placed at the beginning of Introduction section')",
  "placement_explanation": "Two sentences explaining why you chose this placement. If user provided instructions, explain how you followed them exactly. If no instructions, explain why this location is most logical based on document context."
}}

CRITICAL JSON FORMATTING:
- You MUST respond with valid JSON only - no extra text before or after
- ALL newlines within string values MUST be escaped as \\n
- ALL quotes within string values MUST be escaped as \\"
- The JSON must be properly formatted
- Example format: {{"updated_document_content": "## Existing\\n\\nContent\\n\\n## New\\n\\nContent", "updated_document_structure": [...], "placement_applied": "...", "placement_explanation": "..."}}

CRITICAL: The updated_document_content must include:
1. ALL existing document content exactly as it was (word-for-word)
2. The new content placed in the appropriate location (following user instructions EXACTLY if provided)
3. Proper markdown formatting throughout

REMINDER: If user provided placement instructions above, you MUST follow them exactly. Do NOT use your own judgment - use the user's specified location."""
            
            # Call Stage 2 AI
            stage2_messages = [
                {'role': 'system', 'content': stage2_system_prompt},
                {'role': 'user', 'content': 'Place the approved content into the document according to the instructions.'}
            ]
            
            try:
                stage2_response = openai_service.chat_completion(stage2_messages, functions=None, function_call="none")
                stage2_content = stage2_response.get('content', '')
                
                if not stage2_content:
                    raise Exception("Stage 2 AI returned empty response")
                
                # Parse Stage 2 response
                print(f"DEBUG: Stage 2 AI raw response length: {len(stage2_content)}")
                print(f"DEBUG: Stage 2 AI raw response preview: {stage2_content[:500]}...")
                
                stage2_parsed = openai_service.parse_json_response(stage2_content)
                updated_document_content = stage2_parsed.get('updated_document_content', '') or stage2_parsed.get('document_content', '')
                updated_document_structure = stage2_parsed.get('updated_document_structure', []) or stage2_parsed.get('document_structure', [])
                placement_applied = stage2_parsed.get('placement_applied', 'Content placed')
                placement_explanation = stage2_parsed.get('placement_explanation', '')
                
                print(f"DEBUG: Parsed Stage 2 response:")
                print(f"  - updated_document_content length: {len(updated_document_content)}")
                print(f"  - updated_document_structure count: {len(updated_document_structure)}")
                print(f"  - placement_applied: {placement_applied}")
                
                if not updated_document_content:
                    # Try to extract from raw response as fallback
                    print("WARNING: Stage 2 AI did not return updated_document_content in expected format")
                    print("Attempting to extract from raw response...")
                    # Sometimes AI returns markdown directly instead of JSON
                    if stage2_content.strip().startswith('#') or '##' in stage2_content[:100]:
                        # Looks like markdown was returned directly
                        updated_document_content = stage2_content
                        print("Extracted markdown directly from response")
                    else:
                        raise Exception(f"Stage 2 AI did not return updated document content. Raw response: {stage2_content[:500]}")
                
            except Exception as e:
                print(f"Error in Stage 2 AI call: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({'error': f'Failed to place content: {str(e)}'}), 500
        
        # Update document
        try:
            if document_id:
                # Update research document in database
                ResearchDocumentModel.update_document(
                    document_id,
                    markdown_content=updated_document_content,
                    structure=updated_document_structure
                )
                
                # Re-index document for semantic search
                try:
                    vector_service.index_document(document_id, updated_document_content)
                except Exception as index_error:
                    print(f"Warning: Failed to re-index document: {index_error}")
            else:
                # Legacy approach: update file-based document
                session_dir = get_session_dir(session_id)
                doc_path = session_dir / 'doc.md'
                os.makedirs(session_dir, exist_ok=True)
                with open(doc_path, 'w', encoding='utf-8') as f:
                    f.write(updated_document_content)
                
                # Update document structure in database
                if updated_document_structure:
                    DocumentModel.update_document_structure(session_id, updated_document_structure, user_id)
                
                # Re-index document for semantic search
                try:
                    vector_service.index_document(session_id, updated_document_content)
                except Exception as index_error:
                    print(f"Warning: Failed to re-index document: {index_error}")
            
        except Exception as e:
            print(f"Error updating document: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Failed to update document: {str(e)}'}), 500
        
        # Clear pending content
        ChatSessionModel.clear_pending_content(session_id)
        
        # Build chat message with placement explanation
        chat_message = 'Content approved and placed in document.'
        if placement_applied:
            chat_message += f' {placement_applied}'
        if placement_explanation:
            chat_message += f'\n\n{placement_explanation}'
        
        # Add approved message to conversation
        ChatSessionModel.add_message(
            session_id,
            'assistant',
            chat_message,
            sources=None,
            document_content=None,
            document_structure=None,
            placement=None,
            status='approved'
        )
        
        return jsonify({
            'success': True,
            'message': chat_message,
            'placement_applied': placement_applied,
            'placement_explanation': placement_explanation,
            'updated_document': updated_document_content[:500] + '...' if len(updated_document_content) > 500 else updated_document_content
        }), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in approve_content: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500

@chat_bp.route('/reject', methods=['POST'])
def reject_content():
    """Reject pending content"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        session_id = data.get('session_id')
        pending_content_id = data.get('pending_content_id')
        
        if not session_id or not pending_content_id:
            return jsonify({'error': 'session_id and pending_content_id are required'}), 400
        
        # Verify session belongs to user
        session = ChatSessionModel.get_session(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        if session['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Verify pending content exists
        pending_data = ChatSessionModel.get_pending_content(session_id)
        if not pending_data or pending_data['pending_content_id'] != pending_content_id:
            return jsonify({'error': 'Pending content not found'}), 404
        
        # Mark as rejected and clear pending content
        ChatSessionModel.clear_pending_content(session_id)
        
        # Add rejected message to conversation
        ChatSessionModel.add_message(
            session_id,
            'assistant',
            'Content rejected. Would you like to request a rewrite?',
            sources=None,
            document_content=None,
            document_structure=None,
            placement=None,
            status='rejected'
        )
        
        return jsonify({
            'success': True,
            'message': 'Content rejected. Would you like to request a rewrite?'
        }), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in reject_content: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500

@chat_bp.route('/rewrite', methods=['POST'])
def rewrite_content():
    """Request a rewrite of rejected content"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        session_id = data.get('session_id')
        original_message = data.get('original_message')
        
        if not session_id or not original_message:
            return jsonify({'error': 'session_id and original_message are required'}), 400
        
        # Verify session belongs to user
        session = ChatSessionModel.get_session(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        if session['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get conversation history to find rejected content context
        messages = ChatSessionModel.get_messages(session_id)
        rejected_content = None
        
        # Find the most recent rejected content
        for msg in reversed(messages):
            if msg.get('status') == 'rejected' and msg.get('document_content'):
                rejected_content = msg.get('document_content')
                break
        
        # Get document context for Stage 1 AI
        session_dir = get_session_dir(session_id)
        doc_path = session_dir / 'doc.md'
        document_content = ''
        document_structure_flat = DocumentModel.get_document_structure(session_id)
        
        if os.path.exists(doc_path):
            with open(doc_path, 'r', encoding='utf-8') as f:
                document_content = f.read()
        
        # Build structure summary
        if document_structure_flat:
            document_structure_tree = DocumentStructureService.build_tree(document_structure_flat)
            structure_summary = DocumentStructureService.get_structure_summary(document_structure_tree)
        else:
            structure_summary = "No existing document structure."
        
        # Use semantic search for relevant context
        if document_content:
            relevant_chunks = vector_service.search_relevant_chunks(session_id, original_message, top_k=5)
            if relevant_chunks:
                context_parts = [chunk['chunk_text'] for chunk in relevant_chunks]
                document_context = '\n\n'.join(context_parts)
            else:
                document_context = document_content[:2000]  # Limit context
        else:
            document_context = ''
        
        # Get available document types
        available_types = DocumentTypeModel.get_all_types()
        type_names = [t['type_name'] for t in available_types]
        type_descriptions = {t['type_name']: t['description'] for t in available_types}
        types_list = '\n'.join([f"- {name}: {type_descriptions.get(name, '')}" for name in type_names])
        
        # Stage 1 AI System Prompt with rejection context
        rewrite_system_prompt = f"""You are a research assistant helping users write research papers. Your role is to GENERATE CONTENT ONLY - you do NOT decide where content should be placed in the document.

CRITICAL: The user rejected previous content and is requesting a rewrite.
Original user request: {original_message}
Previous rejected content: {rejected_content if rejected_content else "None available"}

Generate new content addressing the same request. Consider why the previous content might have been rejected and improve accordingly.

The user has been building a research document. Here are the most relevant sections:
{document_context}

{structure_summary}

AVAILABLE DOCUMENT TYPES:
{types_list}

CRITICAL: CONTENT GENERATION ONLY - NO PLACEMENT
- Your ONLY job is to generate high-quality research content
- Do NOT provide placement instructions or decide where content should go
- Do NOT include a "placement" field in your response
- Focus on generating well-structured, accurate, properly formatted content

Always respond in JSON format with exactly these keys:
{{
  "message": "your conversational response here (always provide this, even if brief). Use \\n for line breaks.",
  "document_content": "structured markdown content to add (empty string '' if no document update needed). Use \\n for line breaks.",
  "document_structure": [array of structured elements matching document_content. Empty array [] if no document update needed],
  "sources": ["array of source URLs, DOIs, or citations you referenced or reviewed. Empty array [] if no sources"]
}}"""
        
        # Call Stage 1 AI for rewrite
        rewrite_messages = [
            {'role': 'system', 'content': rewrite_system_prompt},
            {'role': 'user', 'content': f'Please rewrite the content for: {original_message}'}
        ]
        
        try:
            rewrite_response = openai_service.chat_completion(rewrite_messages, functions=None, function_call="none")
            rewrite_content = rewrite_response.get('content', '')
            
            if not rewrite_content:
                raise Exception("Rewrite AI returned empty response")
            
            # Parse rewrite response
            rewrite_parsed = openai_service.parse_json_response(rewrite_content)
            chat_message = rewrite_parsed.get('message', '')
            document_content_to_add = rewrite_parsed.get('document_content', '')
            document_structure = rewrite_parsed.get('document_structure', [])
            sources = rewrite_parsed.get('sources', [])
            
        except Exception as e:
            print(f"Error in rewrite AI call: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Failed to generate rewrite: {str(e)}'}), 500
        
        # Store as new pending content
        if document_content_to_add.strip():
            status = "pending_approval"
            
            # Track session start timestamp (when user requested rewrite)
            all_messages = ChatSessionModel.get_messages(session_id)
            last_user_message = None
            for msg in reversed(all_messages):
                if msg.get('role') == 'user':
                    last_user_message = msg
                    break
            
            session_start_timestamp = None
            if last_user_message and last_user_message.get('timestamp'):
                msg_timestamp = last_user_message.get('timestamp')
                if isinstance(msg_timestamp, str):
                    session_start_timestamp = msg_timestamp
                else:
                    session_start_timestamp = msg_timestamp.isoformat()
            else:
                session_start_timestamp = datetime.utcnow().isoformat()
            
            pending_content_data_to_store = {
                'document_content': document_content_to_add,
                'document_structure': document_structure,
                'sources': sources,
                'session_start_timestamp': session_start_timestamp,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            pending_content_id = ChatSessionModel.update_pending_content(session_id, pending_content_data_to_store)
            
            # Store message with pending status
            ChatSessionModel.add_message(
                session_id,
                'assistant',
                chat_message,
                sources=sources,
                document_content=document_content_to_add,
                document_structure=document_structure if document_structure else None,
                placement=None,
                status=status,
                pending_content_id=pending_content_id
            )
            
            return jsonify({
                'response': chat_message,
                'document_content': document_content_to_add,
                'document_structure': document_structure,
                'sources': sources,
                'status': status,
                'pending_content_id': pending_content_id,
                'session_id': session_id
            }), 200
        else:
            # No content generated
            ChatSessionModel.add_message(
                session_id,
                'assistant',
                chat_message,
                sources=sources,
                document_content=None,
                document_structure=None,
                placement=None,
                status=None
            )
            
            return jsonify({
                'response': chat_message,
                'document_content': '',
                'document_structure': [],
                'sources': sources,
                'session_id': session_id
            }), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in rewrite_content: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500


