from flask import Blueprint, request, jsonify
from models.database import ChatSessionModel, DocumentTypeModel, Database, DocumentModel, ProjectModel, ResearchDocumentModel
from services.openai_service import OpenAIService
from services.perplexity_service import PerplexityService
from services.vector_service import VectorService
from services.document_structure_service import DocumentStructureService
from utils.auth import verify_token
from utils.file_helpers import get_session_dir
from datetime import datetime
import os
import json
import re

chat_bp = Blueprint('chat', __name__)
openai_service = OpenAIService()  # Used for Stage 2 AI (placement)
perplexity_service = PerplexityService()  # Used for Stage 1 AI (content generation)
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

def strip_markdown_to_plain_text(text):
    """
    Convert markdown-formatted text to plain text.
    Removes markdown syntax while preserving structure with line breaks.
    Ensures bullet points are on separate lines.
    """
    import re
    if not text:
        return text
    
    # Remove markdown headers (# ## ### etc.)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    
    # Preserve bold for subheadings, but remove from regular text
    # First, identify subheadings (lines that are entirely bold or start with bold)
    # Convert **subheading** to <strong>subheading</strong> for subheadings only
    # For regular text, remove bold markers
    
    lines = text.split('\n')
    processed_lines = []
    
    for line in lines:
        stripped = line.strip()
        # Check if line is a subheading
        # Pattern 1: Line that is entirely **text** (most common subheading format)
        # Pattern 2: Line that starts with **text** (subheading at start of line)
        # Pattern 3: Line that contains **text** and is relatively short (likely a subheading)
        is_subheading = (
            re.match(r'^\*\*[^*]+\*\*$', stripped) or  # Entirely bold
            re.match(r'^\*\*[^*]+\*\*', stripped) or  # Starts with bold
            (re.search(r'\*\*[^*]+\*\*', stripped) and len(stripped) < 100)  # Contains bold and is short
        )
        
        if is_subheading:
            # This looks like a subheading - preserve bold by converting to HTML
            # Convert **text** to <strong>text</strong>
            line_with_bold = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', line)
            processed_lines.append(line_with_bold)
        else:
            # Regular text - remove bold markers
            line_no_bold = re.sub(r'\*\*([^*]+)\*\*', r'\1', line)
            line_no_bold = re.sub(r'__([^_]+)__', r'\1', line_no_bold)
            processed_lines.append(line_no_bold)
    
    text = '\n'.join(processed_lines)
    
    # Remove italic (*text* or _text_)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'\1', text)
    text = re.sub(r'(?<!_)_([^_]+)_(?!_)', r'\1', text)
    
    # Remove code blocks (```code```)
    text = re.sub(r'```[\s\S]*?```', '', text)
    
    # Remove inline code (`code`)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    
    # Remove links but keep the text [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    
    # Remove images ![alt](url)
    text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)
    
    # Remove horizontal rules (--- or ***)
    text = re.sub(r'^[-*]{3,}$', '', text, flags=re.MULTILINE)
    
    # Remove blockquotes (> text)
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    
    # CRITICAL: Ensure bullet points are on separate lines
    # Handle cases where bullet points appear inline in text
    # Process the entire text first to find all bullet patterns, then split by lines
    
    # Before splitting by lines, handle inline bullet points in the entire text
    # Look for patterns: ". - ", ", - ", " - " (these indicate bullet points)
    
    # Pattern 1: ". - " (period, space, dash, space) - bullet after sentence end
    # Pattern 2: ", - " (comma, space, dash, space) - bullet after comma
    # Pattern 3: " - " (space, dash, space) - general bullet pattern
    
    # Replace these patterns with newline + bullet format
    # Handle various patterns where bullet points appear inline
    
    # Pattern 1: ". - " or ".- " (period, optional space, dash, space) - bullet after sentence
    text = re.sub(r'\.\s*-\s+(\S)', r'.\n- \1', text)
    
    # Pattern 2: ", - " or ",- " (comma, optional space, dash, space) - bullet after comma
    text = re.sub(r',\s*-\s+(\S)', r',\n- \1', text)
    
    # Pattern 3: " - " (space, dash, space) - general bullet pattern
    # Only match if not at start of line and followed by a word character
    # This catches remaining inline bullets that appear mid-sentence
    text = re.sub(r'(?<!\n)(?<!^)\s+-\s+(\S)', r'\n- \1', text, flags=re.MULTILINE)
    
    # Now process line by line
    lines = text.split('\n')
    processed_lines = []
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            processed_lines.append('')
            continue
        
        # Skip processing if this is a subheading (contains <strong> tag)
        if '<strong>' in stripped:
            # This is a subheading - keep it as is, don't add bullet points
            processed_lines.append(stripped)
            continue
        
        # Check if line starts with bullet point
        if stripped.startswith('-'):
            # Normalize: ensure "- " format
            normalized = re.sub(r'^-\s*', '- ', stripped)
            processed_lines.append(normalized)
        elif re.match(r'^\d+\.\s+', stripped):
            # Numbered list item - convert to bullet
            normalized = re.sub(r'^\d+\.\s+', '- ', stripped)
            processed_lines.append(normalized)
        else:
            # Regular text line - check if it contains any remaining " - " patterns
            if ' - ' in stripped:
                # Still has bullet pattern - split it
                segments = stripped.split(' - ')
                # First segment is regular text
                if segments[0].strip():
                    processed_lines.append(segments[0].strip())
                # Remaining segments are bullet points
                for seg in segments[1:]:
                    seg_stripped = seg.strip()
                    if seg_stripped:
                        processed_lines.append('- ' + seg_stripped)
            else:
                # No bullet patterns - regular text
                processed_lines.append(stripped)
    
    text = '\n'.join(processed_lines)
    
    # Clean up: remove extra whitespace but preserve line breaks
    # Replace multiple spaces/tabs with single space (but not newlines)
    text = re.sub(r'[ \t]+', ' ', text)
    
    # Ensure proper paragraph separation (double newlines between paragraphs)
    # But keep single newlines between bullet points
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Final cleanup: trim each line
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped:
            cleaned_lines.append(stripped)
        elif cleaned_lines and cleaned_lines[-1]:  # Allow one empty line between content
            cleaned_lines.append('')
    
    text = '\n'.join(cleaned_lines)
    
    return text.strip()

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
                # Include pending approval fields if they exist (for approve/reject/insert-with-ai buttons)
                if 'status' in msg:
                    serialized_msg['status'] = msg['status']
                if 'document_content' in msg:
                    serialized_msg['document_content'] = msg['document_content']
                if 'pending_content_id' in msg:
                    serialized_msg['pending_content_id'] = msg['pending_content_id']
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
        mode = data.get('mode', 'write')
        attached_sections = data.get('attached_sections', [])  # Extract attached sections/highlights
        if mode not in ['write', 'research']:
            mode = 'write'

        # Append attached highlights (only) to the user message so Stage 1 sees them
        highlights_for_prompt = []
        if attached_sections:
            for attachment in attached_sections:
                if isinstance(attachment, dict):
                    content = attachment.get('content', '')
                    if attachment.get('type') == 'highlight' or content.startswith('Highlight:'):
                        # Extract actual highlight text if formatted as Highlight: "text"
                        text_match = re.search(r'Highlight:\s*"([^"]+)"', content)
                        highlight_text = text_match.group(1) if text_match else content
                        # Optionally include note/source if present (keeps it concise)
                        note_match = re.search(r'Note:\s*(.+)', content)
                        source_match = re.search(r'Source:\s*(.+)', content)
                        details = []
                        if note_match:
                            details.append(f"Note: {note_match.group(1)}")
                        if source_match:
                            details.append(f"Source: {source_match.group(1)}")
                        if details:
                            highlight_text = f'{highlight_text} ({"; ".join(details)})'
                        highlights_for_prompt.append(highlight_text)

        message_with_highlights = message
        if highlights_for_prompt:
            highlights_block = "[ATTACHED_HIGHLIGHTS]\n" + "\n".join(f"- {h}" for h in highlights_for_prompt)
            message_with_highlights = f"{message}\n\n{highlights_block}"
        
        if not session_id or not message:
            return jsonify({'error': 'session_id and message are required'}), 400
        
        # Verify session belongs to user
        session = ChatSessionModel.get_session(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        if session['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        ChatSessionModel.add_message(session_id, 'user', message_with_highlights)
        
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
                relevant_chunks = vector_service.search_relevant_chunks(session_id, message, top_k=5)
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
            
            # Build document context section conditionally
            document_context_section = f"""The user has been building a research document. Here are the most relevant sections (retrieved using semantic search):

{document_context}

NOTE: Only relevant document sections are shown above based on semantic similarity to the user's query. If you need information from other parts of the document, ask the user or indicate what additional context might be needed."""
        else:
            # No existing document content
            document_context_section = "The document is currently empty - the user is starting a new research paper."
        
        # Single unified Stage 1 AI System Prompt - Content Generation Only (No Placement)
        system_message_write = f"""You are a research assistant helping users write research papers. Your role is to GENERATE CONTENT ONLY - you do NOT decide where content should be placed in the document.

CRITICAL: UNDERSTANDING CURRENT VS HISTORICAL CONTEXT
- You will receive conversation history for context, but you MUST ONLY respond to the CURRENT USER MESSAGE (the last message)
- Historical messages are provided so you understand what was discussed previously, but you should NOT act on old instructions
- Only the CURRENT USER MESSAGE contains the instruction you need to fulfill RIGHT NOW
- If the conversation history shows previous requests, those have already been completed - do NOT repeat them
- Focus ONLY on what the current user message is asking for

You have two distinct responsibilities:

1. CHAT MESSAGE: Provide conversational, helpful responses focused on reasoning, answering questions, discussing ideas, and providing relevant snippets from the document when helpful. Be concise and conversational - this is for the chat interface.

2. DOCUMENT CONTENT GENERATION: When the user's request requires adding or updating the research document, generate well-structured, formal research content in Markdown format. Your ONLY job is to generate high-quality content - you do NOT provide placement instructions or decide where content goes.

3. SOURCES: Always include any research papers, articles, websites, or other sources you reference or review. Include URLs, DOIs, or citations in the sources array.

{document_context_section}

SEMANTIC SECTION MATCHING FOR CONTENT GENERATION:
When the user asks to add content to an existing section (e.g., "add paragraphs to Introduction" or "add a table to Methodology"), you should:
1. Look through the document content above to understand the context
2. Match semantically - "Introduction" matches "intro", "Introduction", "INTRODUCTION", etc.
3. "Methods" matches "Methodology", "Methods", "Experimental Methods", etc.
4. "Results" matches "Results", "Findings", "Experimental Results", etc.
5. DO NOT include the section title/header in document_content when adding to existing sections - only include the NEW content

AVAILABLE DOCUMENT TYPES:
{types_list}

NEW DOCUMENT TYPES:
If you need a document element type that doesn't exist in the list above, include it in your JSON response under "new_types". For example:
- If you need to represent mathematical equations: add {{"type_name": "equation", "description": "Mathematical equation or formula", "metadata_schema": {{}}}}
- If you need to represent diagrams: add {{"type_name": "diagram", "description": "Visual diagram or flowchart", "metadata_schema": {{}}}}
- If you need to represent footnotes: add {{"type_name": "footnote", "description": "Footnote or endnote", "metadata_schema": {{}}}}

Only create new types when absolutely necessary - first check if an existing type can be used.


MARKDOWN FORMATTING GUIDELINES:
- Use headers: # for main title, ## for sections, ### for subsections
- Use **bold** for emphasis and *italic* for subtle emphasis
- Use bullet points (-) or numbered lists (1.) for lists
- Use code blocks with language tags: ```python for code examples (ALWAYS include language tag)
- Use tables with Markdown table syntax: | Column 1 | Column 2 |\\n|--------|----------|\\n| Value 1 | Value 2 |
- Use > for blockquotes when citing sources
- Use [link text](url) for references
- Keep paragraphs separated by blank lines

EXAMPLES:
- For a new section: "## Methodology\\n\\nThis study employs..."
- For code: "```python\\ndef function():\\n    pass\\n```"
- For tables: "| Method | Accuracy |\\n|--------|----------|\\n| A | 95% |\\n| B | 87% |"
- For lists: "- Item 1\\n- Item 2\\n- Item 3"

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
- Example of CORRECT format: {{"message": "Hello\\nWorld", "document_content": "## Section\\n\\nContent", "sources": ["https://example.com"], "new_types": []}}
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
  "sources": ["array of source URLs, DOIs, or citations you referenced or reviewed. Empty array [] if no sources"],
  "new_types": [array of new document types to create. Empty array [] if no new types needed. Each type: {{"type_name": "name", "description": "desc", "metadata_schema": {{}}}}]
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

Remember: The chat message should be conversational and helpful. The document_content should be formal research writing in Markdown format, but ONLY include new content being added. Sources should include any papers, articles, or websites you mention or review. You generate content only - placement decisions are made separately."""

        system_message_research = f"""You are a research assistant focused on producing concise, well-sourced answers.

MODE: RESEARCH
- PRIMARY: Deliver the researched answer now. Do NOT say you will research; provide findings directly.
- Keep answers succinct and structured (short paragraphs or bullets).
- ALWAYS include sources (URLs/DOIs) in the "sources" array for any claim or fact.
- Use document_content/document_structure ONLY if the user explicitly asks for prose to be drafted/inserted. Otherwise, keep document_content empty.
- If drafting content, follow the document structure guidance exactly and include sources.

CRITICAL: PLAIN TEXT FORMATTING REQUIREMENTS
- Your "message" response MUST be in PLAIN TEXT format - NO markdown formatting whatsoever EXCEPT for subheadings
- DO NOT use markdown syntax like *italic*, # headers, or other markdown characters
- For SUBHEADINGS (section titles within paragraphs): Use **bold** markers around subheading text. Subheadings should NOT have bullet points before them. Example: "**Hardware and Device**" or "**AI Integration**"
- For bullet points: Each bullet point MUST be on its own separate line. Use a dash and space ("- ") at the start of each bullet point, followed by a newline character (\\n) after each bullet point.
- NEVER put multiple bullet points on the same line. Each "- " must be followed by text and then a newline.
- For paragraphs: Separate paragraphs with blank lines (double newlines)
- For lists: Use line breaks between items, with each item on its own line. CRITICAL: Each bullet point must end with a newline character.
- Example of CORRECT format with subheadings and bullets:
  "Here are the key findings:\\n\\n**Hardware Developments**\\n- First finding about hardware...\\n- Second finding shows...\\n\\n**AI Integration**\\n- First finding about AI...\\n- Second finding indicates...\\n\\nAdditional context follows in the next paragraph."

- Example of WRONG format (DO NOT use - bullets on same line):
  "Key findings: - First finding - Second finding - Third finding"

- Example of WRONG format (DO NOT use bullets for subheadings):
  "- Hardware and Device\\n- First point" (subheadings should use **bold**, not bullets)

Context from the user's document (if any):
{document_context_section}

Document structure summary:
{structure_summary}

Attached sections from the user message:

Available document types:
{types_list}

When drafting content (only if explicitly requested):
- Follow the DOCUMENT STRUCTURE REQUIREMENTS, including hierarchical ids, type, parent_id, and metadata.
- Exclude section headers when adding to existing sections.
- Provide new_types only when necessary.
- Always include sources for any claims.

If the request is purely research/Q&A:
- Provide the researched answer directly in "message" as PLAIN TEXT (no markdown).
- Include specific findings (not just intentions) and cite sources in "sources".
- Keep document_content empty unless the user asked you to write prose.
- Remember: Use plain text with line breaks for structure, NOT markdown formatting."""

        system_message = system_message_write if mode == 'write' else system_message_research
        
        # Check for pending content (for revisions)
        pending_content_data = ChatSessionModel.get_pending_content(session_id)
        is_revision = pending_content_data is not None
        
        # If there's pending content, modify system message to include revision context
        if is_revision and pending_content_data:
            previous_content = pending_content_data['pending_content'].get('document_content', '')
            previous_sources = pending_content_data['pending_content'].get('sources', [])
            revision_context = f"""

CRITICAL: The user has pending content awaiting approval. They are now requesting changes or revisions to specific parts.

PREVIOUS PENDING CONTENT (you MUST keep all of this unless explicitly asked to change it):
{previous_content}

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
8. Your sources array MUST include ALL sources: previous sources + any new sources you reference

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
        
        # Perplexity requires strict alternation between user/assistant messages
        # Merge consecutive messages of the same role to ensure alternation
        alternated_messages = []
        for msg in openai_messages:
            if msg['role'] == 'system':
                # System messages go first, as-is
                alternated_messages.append(msg)
            elif not alternated_messages or alternated_messages[-1]['role'] == 'system':
                # First non-system message
                alternated_messages.append(msg)
            elif alternated_messages[-1]['role'] == msg['role']:
                # Same role as previous - merge content
                alternated_messages[-1]['content'] += '\n\n' + msg['content']
            else:
                # Different role - add normally
                alternated_messages.append(msg)
        
        # Stage 1 AI - Perplexity (content generation with web search)
        # Log highlights/attachments before sending to Perplexity API
        print("=" * 80)
        print("STAGE ONE PERPLEXITY API CALL - ATTACHMENTS LOG")
        print("=" * 80)
        
        # Extract highlights from attached_sections
        highlights = []
        if attached_sections:
            for attachment in attached_sections:
                if isinstance(attachment, dict):
                    # Check if it's a highlight (type='highlight' or content starts with 'Highlight:')
                    if attachment.get('type') == 'highlight' or (attachment.get('content', '').startswith('Highlight:')):
                        highlights.append(attachment)
        
        if highlights:
            print(f"Highlights attached: {len(highlights)}")
            for i, highlight in enumerate(highlights, 1):
                highlight_content = highlight.get('content', '')
                # Extract the actual highlight text from the formatted content
                # Format is: Highlight: "text"\nNote: ...\nSource: ...
                text_match = re.search(r'Highlight:\s*"([^"]+)"', highlight_content)
                highlight_text = text_match.group(1) if text_match else highlight_content
                print(f"  Highlight {i}:")
                print(f"    Content: {highlight_text}")
        else:
            print("Highlights attached: zero")
        
        print("=" * 80)
        
        try:
            ai_response = perplexity_service.chat_completion(alternated_messages)
        except Exception as e:
            print(f"Error calling Perplexity API: {e}")
            import traceback
            traceback.print_exc()
            raise
        
        # Get response content
        ai_response_content = ai_response.get('content') or ''
        
        # If no content, create a fallback response
        if not ai_response_content:
            ai_response_content = json.dumps({
                "message": "I apologize, but I didn't receive a proper response. Please try again.",
                "document_content": "",
                "document_structure": [],
                "sources": [],
                "new_types": []
            })
        
        # Parse JSON response
        parsed_response = perplexity_service.parse_json_response(ai_response_content)
        
        # Handle new document types from AI response
        new_types = parsed_response.get('new_types', [])
        for new_type in new_types:
            if isinstance(new_type, dict) and new_type.get('type_name'):
                try:
                    type_id = DocumentTypeModel.create_type(
                        type_name=new_type.get('type_name'),
                        description=new_type.get('description', ''),
                        metadata_schema=new_type.get('metadata_schema', {}),
                        is_system=False
                    )
                    if type_id:
                        print(f"DEBUG: Created new document type: {new_type.get('type_name')}")
                except Exception as e:
                    print(f"DEBUG: Failed to create document type {new_type.get('type_name')}: {e}")
        
        # Log parsed response (without raw content)
        print("DEBUG: Parsed Response:")
        print(f"  - message length: {len(parsed_response.get('message', ''))}")
        print(f"  - document_content length: {len(parsed_response.get('document_content', ''))}")
        print(f"  - sources count: {len(parsed_response.get('sources', []))}")
        if parsed_response.get('document_content'):
            print(f"  - document_content preview: {parsed_response.get('document_content', '')[:200]}...")
        print("=" * 80)
        
        chat_message = parsed_response.get('message', '')
        document_content_to_add = parsed_response.get('document_content', '')
        sources = parsed_response.get('sources', [])
        
        # Strip markdown from research mode responses to ensure plain text output
        if mode == 'research' and chat_message:
            original_length = len(chat_message)
            original_newlines = chat_message.count('\n')
            chat_message = strip_markdown_to_plain_text(chat_message)
            new_length = len(chat_message)
            new_newlines = chat_message.count('\n')
            print(f"DEBUG: Stripped markdown from research mode response")
            print(f"  - Original length: {original_length}, New length: {new_length}")
            print(f"  - Original newlines: {original_newlines}, New newlines: {new_newlines}")
            print(f"  - Preview: {chat_message[:200]}...")
        
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
                placement=None,
                status=None
            )
        
        # DO NOT auto-insert content - it's now pending approval
        # Content will be inserted when user approves via /chat/approve endpoint
        
        print(f"DEBUG: document_content_to_add exists: {bool(document_content_to_add.strip())}")
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
            'sources': sources,
            'session_id': session_id
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
        original_content = pending_content.get('document_content', '')
        
        if edited_content:
            # User edited specific content
            content_to_place = edited_content
            print(f"DEBUG: Using edited content (length: {len(edited_content)})")
        else:
            content_to_place = original_content
        
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
        
        # Get full document content
        # New approach: use document_id if provided, otherwise fall back to session_id (legacy)
        document_content = ''
        
        if document_id:
            # Use research document model
            document = ResearchDocumentModel.get_document(document_id)
            if not document:
                return jsonify({'error': 'Document not found'}), 404
            
            if document['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            document_content = document.get('markdown_content', '')
        else:
            # Legacy approach: use session-based file storage
            session_dir = get_session_dir(session_id)
            doc_path = session_dir / 'doc.md'
            
            if os.path.exists(doc_path):
                with open(doc_path, 'r', encoding='utf-8') as f:
                    document_content = f.read()
        
        # Check if document is empty - if so, skip Stage 2 AI and just append content directly
        is_document_empty = not document_content.strip()
        
        if is_document_empty:
            print("DEBUG: Document is empty - skipping Stage 2 AI and appending content directly")
            # Just use the content as-is since there's nothing to merge with
            updated_document_content = content_to_place
            placement_applied = "Content added to empty document"
            placement_explanation = "The document was empty, so the content was added as the initial content."
        else:
            # Document has content - use Stage 2 AI for placement
            
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

You MUST return valid JSON with exactly these fields:
{{
  "updated_document_content": "full markdown document with ALL existing content preserved exactly + new content placed appropriately",
  "placement_applied": "brief description of where content was placed (e.g., 'Content placed at the beginning of Introduction section')",
  "placement_explanation": "Two sentences explaining why you chose this placement. If user provided instructions, explain how you followed them exactly. If no instructions, explain why this location is most logical based on document context."
}}

CRITICAL JSON FORMATTING:
- You MUST respond with valid JSON only - no extra text before or after
- ALL newlines within string values MUST be escaped as \\n
- ALL quotes within string values MUST be escaped as \\"
- The JSON must be properly formatted
- Example format: {{"updated_document_content": "## Existing\\n\\nContent\\n\\n## New\\n\\nContent", "placement_applied": "...", "placement_explanation": "..."}}

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
                placement_applied = stage2_parsed.get('placement_applied', 'Content placed')
                placement_explanation = stage2_parsed.get('placement_explanation', '')
                
                print(f"DEBUG: Parsed Stage 2 response:")
                print(f"  - updated_document_content length: {len(updated_document_content)}")
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
                    markdown_content=updated_document_content
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

@chat_bp.route('/direct-insert', methods=['POST'])
def direct_insert_content():
    """Directly insert pending content at the end of the document (no AI placement)"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        session_id = data.get('session_id')
        document_id = data.get('document_id')  # Optional: document_id for research documents
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
        original_content = pending_content.get('document_content', '')
        
        if edited_content:
            content_to_insert = edited_content
            print(f"DEBUG: Using edited content for direct insert (length: {len(edited_content)})")
        else:
            content_to_insert = original_content
        
        if not content_to_insert.strip():
            return jsonify({'error': 'No content to insert'}), 400
        
        # Get current document content
        document_content = ''
        
        if document_id:
            # Use research document model
            document = ResearchDocumentModel.get_document(document_id)
            if not document:
                return jsonify({'error': 'Document not found'}), 404
            
            if document['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            document_content = document.get('markdown_content', '')
        else:
            # Legacy approach: use session-based file storage
            session_dir = get_session_dir(session_id)
            doc_path = session_dir / 'doc.md'
            
            if os.path.exists(doc_path):
                with open(doc_path, 'r', encoding='utf-8') as f:
                    document_content = f.read()
        
        # Direct insertion: Append content at the end of the document
        # If document is empty, just use the new content
        # If document has content, add a separator and append
        if document_content.strip():
            # Add new content at the end with proper spacing
            updated_document_content = document_content.rstrip() + '\n\n' + content_to_insert
        else:
            # Empty document - just use the new content
            updated_document_content = content_to_insert
        
        # Update document
        try:
            if document_id:
                # Update research document in database
                ResearchDocumentModel.update_document(
                    document_id,
                    markdown_content=updated_document_content
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
        
        # Build chat message
        chat_message = 'Content inserted at the end of the document.'
        
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
            'placement_applied': 'Content appended at the end of document',
            'updated_document': updated_document_content[:500] + '...' if len(updated_document_content) > 500 else updated_document_content
        }), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in direct_insert_content: {str(e)}")
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

        if os.path.exists(doc_path):
            with open(doc_path, 'r', encoding='utf-8') as f:
                document_content = f.read()
        
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

AVAILABLE DOCUMENT TYPES:
{types_list}

NEW DOCUMENT TYPES:
If you need a document element type that doesn't exist in the list above, include it in your JSON response under "new_types".

CRITICAL: CONTENT GENERATION ONLY - NO PLACEMENT
- Your ONLY job is to generate high-quality research content
- Do NOT provide placement instructions or decide where content should go
- Do NOT include a "placement" field in your response
- Focus on generating well-structured, accurate, properly formatted content

Always respond in JSON format with exactly these keys:
{{
  "message": "your conversational response here (always provide this, even if brief). Use \\n for line breaks.",
  "document_content": "structured markdown content to add (empty string '' if no document update needed). Use \\n for line breaks.",
  "sources": ["array of source URLs, DOIs, or citations you referenced or reviewed. Empty array [] if no sources"],
  "new_types": [array of new document types to create. Empty array [] if no new types needed]
}}"""
        
        # Call Stage 1 AI for rewrite
        rewrite_messages = [
            {'role': 'system', 'content': rewrite_system_prompt},
            {'role': 'user', 'content': f'Please rewrite the content for: {original_message}'}
        ]
        
        try:
            rewrite_response = perplexity_service.chat_completion(rewrite_messages)
            rewrite_content = rewrite_response.get('content', '')
            
            if not rewrite_content:
                raise Exception("Rewrite AI returned empty response")
            
            # Parse rewrite response
            rewrite_parsed = perplexity_service.parse_json_response(rewrite_content)
            chat_message = rewrite_parsed.get('message', '')
            document_content_to_add = rewrite_parsed.get('document_content', '')
            sources = rewrite_parsed.get('sources', [])
            
            # Handle new document types from AI response
            new_types = rewrite_parsed.get('new_types', [])
            for new_type in new_types:
                if isinstance(new_type, dict) and new_type.get('type_name'):
                    try:
                        type_id = DocumentTypeModel.create_type(
                            type_name=new_type.get('type_name'),
                            description=new_type.get('description', ''),
                            metadata_schema=new_type.get('metadata_schema', {}),
                            is_system=False
                        )
                        if type_id:
                            print(f"DEBUG: Created new document type in rewrite: {new_type.get('type_name')}")
                    except Exception as type_error:
                        print(f"DEBUG: Failed to create document type {new_type.get('type_name')}: {type_error}")
            
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
                placement=None,
                status=status,
                pending_content_id=pending_content_id
            )
            
            return jsonify({
                'response': chat_message,
                'document_content': document_content_to_add,
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


