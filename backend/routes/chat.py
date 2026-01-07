from flask import Blueprint, request, jsonify
from models.database import ChatSessionModel, Database, ProjectModel, ResearchDocumentModel
from services.perplexity_service import PerplexityService
from services.vector_service import VectorService
from services.redis_service import get_redis_service
from utils.auth import get_user_id_from_token, log_auth_info
from utils.file_helpers import get_session_dir
from utils.html_helpers import strip_html_tags
from utils.markdown_converter import markdown_to_html
from config import Config
from datetime import datetime
import os
import json
import re

chat_bp = Blueprint('chat', __name__)
perplexity_service = PerplexityService()  # Used for content generation
vector_service = VectorService()

# get_user_id_from_token is now imported from utils.auth

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
        
        # Log auth info for Chrome extension
        log_auth_info(project_id)
        
        # Verify project exists and belongs to user
        project = ProjectModel.get_project(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        if project['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized - project does not belong to user'}), 403
        
        session_id = ChatSessionModel.create_session(user_id, project_id)
        
        # Invalidate cache
        redis_service = get_redis_service()
        redis_service.delete(f"cache:sessions:{user_id}:{project_id}")
        redis_service.delete(f"cache:sessions:{user_id}:all")
        print(f"[REDIS] Invalidating cache: cache:sessions:{user_id}:{project_id or 'all'}")
        print(f"[REDIS] Cache invalidated successfully")
        
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
            # Generate cache key for individual session
            cache_key = f"cache:session:{session_id}"
            
            # Check Redis cache first
            redis_service = get_redis_service()
            cached_data = redis_service.get(cache_key)
            
            if cached_data is not None:
                # Verify user still owns this session (security check)
                if cached_data.get('user_id') == user_id:
                    print(f"[REDIS] get_session: Cache hit for session {session_id}")
                    # Remove user_id from response (it's only for verification)
                    response_data = {k: v for k, v in cached_data.items() if k != 'user_id'}
                    return jsonify(response_data), 200
            
            # Cache miss - fetch from MongoDB
            print(f"[REDIS] get_session: Cache miss for session {session_id}, fetching from MongoDB")
            
            session = ChatSessionModel.get_session(session_id)
            if not session:
                return jsonify({'error': 'Session not found'}), 404
            
            # Verify user owns this session
            if session['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            # Log session entry details for Chrome extension configuration
            project_id = session.get('project_id')
            log_auth_info(project_id)
            
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
            
            response_data = {
                'session_id': session['session_id'],
                'project_id': project_id,
                'project_name': project_name,
                'messages': serialized_messages,
                'created_at': session['created_at'].isoformat(),
                'updated_at': session['updated_at'].isoformat(),
                'user_id': user_id  # Store for cache verification
            }
            
            # Cache the result (shorter TTL for individual sessions since they change more frequently)
            redis_service.set(cache_key, response_data, ttl=Config.REDIS_TTL_VERSION)  # 1 minute TTL
            print(f"[REDIS] get_session: Cached session {session_id}")
            
            # Remove user_id from response
            response_data = {k: v for k, v in response_data.items() if k != 'user_id'}
            return jsonify(response_data), 200
        
        # If no session_id, return all sessions for the user
        # Optionally filter by project_id
        project_id_filter = request.args.get('project_id')
        
        # Pagination parameters
        limit = request.args.get('limit', type=int)
        skip = request.args.get('skip', type=int, default=0)
        
        # Only cache first page (skip=0, limit=5) to avoid cache complexity with pagination
        use_cache = (skip == 0 and limit == 5)
        
        if use_cache:
            # Generate cache key for session list (only for first page)
            if project_id_filter:
                cache_key = f"cache:sessions:{user_id}:{project_id_filter}"
            else:
                cache_key = f"cache:sessions:{user_id}:all"
            
            # Check Redis cache first
            redis_service = get_redis_service()
            cached_data = redis_service.get(cache_key)
            
            if cached_data is not None:
                print(f"[REDIS] get_session: Cache hit for session list (project: {project_id_filter or 'all'})")
                return jsonify(cached_data), 200
        
        # Cache miss or paginated request - fetch from MongoDB
        print(f"[REDIS] get_session: Fetching sessions (project: {project_id_filter or 'all'}, limit: {limit}, skip: {skip})")
        
        sessions = ChatSessionModel.get_all_sessions(user_id, project_id_filter, limit=limit, skip=skip)
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
        
        # Get total count for pagination (only if limit is specified)
        total_count = None
        has_more = False
        if limit is not None:
            # Count total sessions matching the query using MongoDB count_documents (more efficient)
            from models.database import Database
            db = Database.get_db()
            query = {'user_id': user_id}
            if project_id_filter:
                query['project_id'] = project_id_filter
            total_count = db.chat_sessions.count_documents(query)
            has_more = (skip + limit) < total_count
        
        response_data = {
            'sessions': sessions_list,
            'has_more': has_more,
            'total_count': total_count
        }
        
        # Cache only the first page
        if use_cache:
            redis_service = get_redis_service()
            redis_service.set(cache_key, response_data, ttl=Config.REDIS_TTL_DOCUMENTS)  # 5 minutes TTL
            print(f"[REDIS] get_session: Cached {len(sessions_list)} sessions")
        
        return jsonify(response_data), 200
    
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
        
        # Invalidate cache for this session (message was added)
        redis_service = get_redis_service()
        redis_service.delete(f"cache:session:{session_id}")
        # Also invalidate session list cache for the project
        session_data = ChatSessionModel.get_session(session_id)
        if session_data:
            project_id = session_data.get('project_id')
            if project_id:
                redis_service.delete(f"cache:sessions:{user_id}:{project_id}")
            redis_service.delete(f"cache:sessions:{user_id}:all")
            print(f"[REDIS] Invalidating cache: cache:session:{session_id}")
            print(f"[REDIS] Cache invalidated successfully")
        
        # Get document content for context
        session_dir = get_session_dir(session_id)
        doc_path = session_dir / 'doc.md'
        document_content = ''
        
        if os.path.exists(doc_path):
            with open(doc_path, 'r', encoding='utf-8') as f:
                document_content = f.read()
        
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
        
        # Write mode system prompt - for generating document content
        system_message_write = f"""You are a research assistant helping users write research papers.

MODE: WRITE (Content Generation)
- Generate well-structured research content in Markdown format when asked
- The user will insert content where they want - you just generate quality content
- If the user asks a question without requesting content, respond conversationally with document_content empty

{document_context_section}

MARKDOWN FORMATTING:
- Headers: # title, ## section, ### subsection
- Lists: - bullet or 1. numbered
- Tables: | Col1 | Col2 |\\n|------|------|\\n| val | val |
- Code: ```language\\ncode\\n```
- Bold: **text**, Italic: *text*

RULES:
- When adding to existing sections, only include NEW content (no headers, no existing text)
- Keep chat message brief and conversational
- Put sources in "sources" array, NOT in document_content
- Escape newlines as \\n in JSON strings

Always respond in JSON format:
{{
  "message": "brief conversational response",
  "document_content": "markdown content to add (or empty string if no content needed)",
  "sources": ["array of URLs/citations"],
  "new_types": []
}}"""

        system_message_research = f"""You are a research assistant helping the user explore ideas and refine what they want to write.

MODE: RESEARCH (Conversation Only)
- Your role is to have a conversation with the user - answer questions, discuss ideas, help them think through their research
- NEVER generate document content - document_content must ALWAYS be an empty string ""
- Focus on understanding what the user wants, providing research insights, and helping them plan their writing
- When the user is ready to write actual content, they will switch to Write mode

RESPONSE FORMAT:
- Keep responses concise and conversational
- Use plain text with simple formatting (bullets with "- ", bold with **text**)
- Separate paragraphs with blank lines
- ALWAYS include sources (URLs/DOIs) in the "sources" array for any facts or claims

Context from the user's document (if any):
{document_context_section}

Always respond in JSON format:
{{
  "message": "your conversational response here",
  "document_content": "",
  "sources": ["array of source URLs or citations"],
  "new_types": []
}}

CRITICAL: document_content must ALWAYS be empty string "" in research mode. This mode is for conversation only."""

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
                "sources": [],
                "new_types": []
            })
        
        # Parse JSON response
        parsed_response = perplexity_service.parse_json_response(ai_response_content)
        
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
            
            # Invalidate cache for this session (message was added)
            redis_service = get_redis_service()
            redis_service.delete(f"cache:session:{session_id}")
            # Also invalidate session list cache for the project
            session_data = ChatSessionModel.get_session(session_id)
            if session_data:
                project_id = session_data.get('project_id')
                if project_id:
                    redis_service.delete(f"cache:sessions:{user_id}:{project_id}")
                redis_service.delete(f"cache:sessions:{user_id}:all")
                print(f"[REDIS] Invalidating cache: cache:session:{session_id}")
                print(f"[REDIS] Cache invalidated successfully")
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
            
            # Invalidate cache for this session (message was added)
            redis_service = get_redis_service()
            redis_service.delete(f"cache:session:{session_id}")
            # Also invalidate session list cache for the project
            session_data = ChatSessionModel.get_session(session_id)
            if session_data:
                project_id = session_data.get('project_id')
                if project_id:
                    redis_service.delete(f"cache:sessions:{user_id}:{project_id}")
                redis_service.delete(f"cache:sessions:{user_id}:all")
                print(f"[REDIS] Invalidating cache: cache:session:{session_id}")
                print(f"[REDIS] Cache invalidated successfully")
        
        # DO NOT auto-insert content - it's now pending approval
        # Content will be inserted when user approves via /chat/approve endpoint
        
        print(f"DEBUG: document_content_to_add exists: {bool(document_content_to_add.strip())}")
        print(f"DEBUG: status: {status}")
        print(f"DEBUG: pending_content_id: {pending_content_id}")
        
        # Note: Auto-insertion is disabled. Content requires user approval via /direct-insert endpoint.
        # The frontend handles cursor-based or end-of-document insertion.
        
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
            content_to_insert_markdown = edited_content
            print(f"DEBUG: Using edited content for direct insert (length: {len(edited_content)})")
        else:
            content_to_insert_markdown = original_content
        
        if not content_to_insert_markdown.strip():
            return jsonify({'error': 'No content to insert'}), 400
        
        # Convert AI's Markdown output to HTML before storing
        content_to_insert_html = markdown_to_html(content_to_insert_markdown)
        
        # Get current document content (stored as HTML)
        document_content = ''
        
        if document_id:
            # Use research document model
            document = ResearchDocumentModel.get_document(document_id)
            if not document:
                return jsonify({'error': 'Document not found'}), 404
            
            if document['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            # Content is stored as HTML in markdown_content field
            document_content = document.get('markdown_content', '')
        else:
            # Legacy approach: use session-based file storage
            session_dir = get_session_dir(session_id)
            doc_path = session_dir / 'doc.md'
            
            if os.path.exists(doc_path):
                with open(doc_path, 'r', encoding='utf-8') as f:
                    document_content = f.read()
        
        # Direct insertion: Append HTML content at the end of the document
        # If document is empty, just use the new content
        # If document has content, add a separator and append
        if document_content.strip():
            # Add new HTML content at the end with proper spacing
            updated_document_content = document_content.rstrip() + '\n\n' + content_to_insert_html
        else:
            # Empty document - just use the new HTML content
            updated_document_content = content_to_insert_html
        
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
        
        # Update the message status to 'approved' in the database
        updated = ChatSessionModel.update_message_status(session_id, pending_content_id, 'approved')
        
        if not updated:
            return jsonify({'error': 'Message not found'}), 404
        
        # Clear pending content
        ChatSessionModel.clear_pending_content(session_id)
        
        return jsonify({
            'success': True,
            'placement_applied': 'Content appended at the end of document',
            'updated_document': updated_document_content[:500] + '...' if len(updated_document_content) > 500 else updated_document_content
        }), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in direct_insert_content: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500

@chat_bp.route('/clear-pending', methods=['POST'])
def clear_pending_content_route():
    """Clear pending content without modifying the document.
    Used for client-side insertion where the frontend handles document updates.
    """
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
            # Pending content already cleared or doesn't exist - this is fine (idempotent operation)
            # The desired end state (no pending content) is already achieved, so return success
            return jsonify({
                'success': True,
                'message': 'Pending content already cleared or not found'
            }), 200
        
        # Update the message status to 'approved' in the database
        updated = ChatSessionModel.update_message_status(session_id, pending_content_id, 'approved')
        
        if not updated:
            # Message not found, but that's okay - might have been already processed
            # Still clear pending content if it exists (idempotent operation)
            ChatSessionModel.clear_pending_content(session_id)
            return jsonify({
                'success': True,
                'message': 'Message not found (may have been already processed)'
            }), 200
        
        # Clear pending content
        ChatSessionModel.clear_pending_content(session_id)
        
        return jsonify({
            'success': True
        }), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in clear_pending_content: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500
