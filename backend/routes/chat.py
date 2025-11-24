from flask import Blueprint, request, jsonify
from models.database import ChatSessionModel, DocumentTypeModel, Database, DocumentModel
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

@chat_bp.route('/session', methods=['POST'])
def create_session():
    """Create a new chat session"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        session_id = ChatSessionModel.create_session(user_id)
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
            
            return jsonify({
                'session_id': session['session_id'],
                'messages': serialized_messages,
                'created_at': session['created_at'].isoformat(),
                'updated_at': session['updated_at'].isoformat()
            }), 200
        
        # If no session_id, return all sessions for the user
        sessions = ChatSessionModel.get_all_sessions(user_id)
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
            
            sessions_list.append({
                'session_id': session['session_id'],
                'title': title,
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
        if document_structure_flat:
            document_structure_tree = DocumentStructureService.build_tree(document_structure_flat)
            structure_summary = DocumentStructureService.get_structure_summary(document_structure_tree)
        else:
            document_structure_tree = {'elements': {}, 'roots': []}
            structure_summary = "No existing document structure."
        
        # Get available document types (needed for system prompt)
        available_types = DocumentTypeModel.get_all_types()
        type_names = [t['type_name'] for t in available_types]
        type_descriptions = {t['type_name']: t['description'] for t in available_types}
        types_list = '\n'.join([f"- {name}: {type_descriptions.get(name, '')}" for name in type_names])
        
        # Build context with document
        # Phase 1: Always send full document
        # Phase 2: Use semantic search to send only relevant parts
        use_semantic_search = False  # Toggle for Phase 2
        
        if document_content:
            if use_semantic_search:
                # Use semantic search to find relevant chunks
                relevant_chunks = vector_service.search_relevant_chunks(session_id, message, top_k=3)
                if relevant_chunks:
                    context_parts = [chunk['chunk_text'] for chunk in relevant_chunks]
                    document_context = '\n\n'.join(context_parts)
                else:
                    # Fallback to full document if no relevant chunks found
                    document_context = document_content
            else:
                # Phase 1: Send full document
                document_context = document_content
            
            # Enhanced system message with markdown guidance and structured document requirements
            system_message = f"""You are a research assistant helping users write research papers.

CRITICAL: UNDERSTANDING CURRENT VS HISTORICAL CONTEXT
- You will receive conversation history for context, but you MUST ONLY respond to the CURRENT USER MESSAGE (the last message)
- Historical messages are provided so you understand what was discussed previously, but you should NOT act on old instructions
- Only the CURRENT USER MESSAGE contains the instruction you need to fulfill RIGHT NOW
- If the conversation history shows previous requests, those have already been completed - do NOT repeat them
- Focus ONLY on what the current user message is asking for

You have two distinct responsibilities:

1. CHAT MESSAGE: Provide conversational, helpful responses focused on reasoning, answering questions, discussing ideas, and providing relevant snippets from the document when helpful. Be concise and conversational - this is for the chat interface.

2. DOCUMENT CONTENT: When the user's request requires adding or updating the research document, provide well-structured, formal research content in Markdown format. Only include this when there's actual content to add - not for every response.

3. DOCUMENT STRUCTURE: When providing document_content, you MUST also provide a structured representation in the "document_structure" field. This allows users to select and attach specific sections, paragraphs, tables, or code snippets.

4. SOURCES: Always include any research papers, articles, websites, or other sources you reference or review. Include URLs, DOIs, or citations in the sources array.

The user has been building a research document. Here is the current content of their document (in Markdown format):

{document_context}

{structure_summary}

SEMANTIC SECTION MATCHING:
When the user asks to add content to an existing section (e.g., "add paragraphs to Introduction" or "add a table to Methodology"), you MUST:
1. Look through the document structure above to find a section with a similar name/title
2. Match semantically - "Introduction" matches "intro", "Introduction", "INTRODUCTION", etc.
3. "Methods" matches "Methodology", "Methods", "Experimental Methods", etc.
4. "Results" matches "Results", "Findings", "Experimental Results", etc.
5. Use the section's ID from the structure (shown in brackets like [sec-introduction])
6. Set placement strategy to "insert_into" with that section's ID as target_id
7. Set parent_id in all new elements to that section's ID
8. DO NOT create a new section if the user is adding content to an existing one

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
- parent_id: ID of parent element (null for top-level sections)
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

PLACEMENT INSTRUCTIONS:
When providing document_content, you MUST also provide "placement" instructions telling where to insert the content:

{{
  "strategy": "insert_after" | "insert_before" | "insert_into" | "insert_at_end",
  "target_id": "element-id" | null,  // ID of existing element to place relative to (null for insert_at_end)
  "position": "beginning" | "end" | null,  // For insert_into strategy only
  "reason": "Brief explanation of why this placement makes sense"
}}

Placement strategies:
- "insert_at_end": Add at the very end of document (use when no specific location needed or for first content)
- "insert_after": Insert after the target element (e.g., Background after Introduction)
- "insert_before": Insert before the target element (e.g., Abstract before Introduction)
- "insert_into": Insert into a section/subsection (use position: "beginning" or "end")

CRITICAL: SEMANTIC MATCHING FOR EXISTING SECTIONS
- ALWAYS check the document structure above to see if a section with a similar name/title already exists
- If the user asks to add paragraphs, subsections, tables, code blocks, or any content to an EXISTING section, you MUST:
  1. Find the existing section ID by matching the section name semantically (even if not exact)
  2. Use "insert_into" strategy with that section's ID as target_id
  3. Set position to "end" to append to the section
  4. Set parent_id in document_structure elements to point to that existing section
  5. DO NOT include the section title/header in document_content - only include the NEW content (paragraphs, tables, etc.)
  6. DO NOT repeat existing content - only include what you are adding
  7. DO NOT create section elements (type="section") when adding to existing sections - only create paragraph, table, code_block, etc. elements
- DO NOT create a new section if the user is adding content to an existing one
- DO NOT include section headers (## Introduction) when adding to existing sections - only include the new paragraphs/content
- When adding to an existing section, document_structure should contain ONLY paragraph/table/code_block/etc elements with parent_id pointing to that section
- Examples:
  - User: "Add two paragraphs to the Introduction section" → 
    * Find "Introduction" section ID (e.g., "sec-introduction")
    * document_content should ONLY contain the two new paragraphs (no "## Introduction" header)
    * document_structure should have two paragraph elements (type="paragraph") with parent_id="sec-introduction"
    * DO NOT create a section element - only paragraph elements
    * placement: {{"strategy": "insert_into", "target_id": "sec-introduction", "position": "end"}}
  - User: "Add a table to Methodology" → 
    * Find "Methodology" section ID, use insert_into with that ID
    * document_content should ONLY contain the table markdown (no section header)
    * document_structure should have one table element (type="table") with parent_id pointing to Methodology section
    * DO NOT create a section element
  - User: "Add a subsection about data collection to Methods" → Find "Methods" or "Methodology" section ID, use insert_into
    * For subsections, you CAN create a subsection element (type="subsection") with parent_id pointing to the Methods section

Special rules:
- References section should always use "insert_at_end" with target_id: null
- Sections should be ordered logically (Introduction → Background → Methodology → Results → Discussion → References)
- Subsections go into their parent section using "insert_into"
- Content elements (paragraphs, tables, code) go into their section/subsection using "insert_into"
- For the first content in an empty document, use "insert_at_end" with target_id: null
- When user explicitly asks to add to an existing section, ALWAYS use "insert_into" with that section's ID

Always respond in JSON format with exactly these keys:
{{
  "message": "your conversational response here (always provide this, even if brief). Use \\n for line breaks.",
  "document_content": "structured markdown content to add (empty string '' if no document update needed). Use \\n for line breaks. IMPORTANT: When adding to an existing section, ONLY include the NEW content - do NOT repeat the section header or existing content.",
  "document_structure": [array of structured elements matching document_content. Empty array [] if no document update needed],
  "placement": {{placement instructions object. Required if document_content is provided, null otherwise}},
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

Remember: The chat message should be conversational and helpful. The document_content should be formal research writing in Markdown format, but ONLY include new content being added. The document_structure should provide granular, selectable elements that match the document_content. Sources should include any papers, articles, or websites you mention or review."""
        else:
            # No existing document content, but structure_summary is already initialized above
            # Prepare attached sections markdown for context (if any)
            attached_markdown_for_prompt = ''
            if attached_sections:
                attached_contents = [section.get('content', '') for section in attached_sections if section.get('content')]
                attached_markdown_for_prompt = '\n\n'.join(attached_contents)
            
            system_message = f"""You are a research assistant helping users write research papers.

CRITICAL: UNDERSTANDING CURRENT VS HISTORICAL CONTEXT
- You will receive conversation history for context, but you MUST ONLY respond to the CURRENT USER MESSAGE (the last message)
- Historical messages are provided so you understand what was discussed previously, but you should NOT act on old instructions
- Only the CURRENT USER MESSAGE contains the instruction you need to fulfill RIGHT NOW
- If the conversation history shows previous requests, those have already been completed - do NOT repeat them
- Focus ONLY on what the current user message is asking for

You have two distinct responsibilities:

1. CHAT MESSAGE: Provide conversational, helpful responses focused on reasoning, answering questions, discussing ideas. Be concise and conversational - this is for the chat interface.

2. DOCUMENT CONTENT: When the user's request requires adding or updating the research document, provide well-structured, formal research content in Markdown format. Only include this when there's actual content to add - not for every response.

3. DOCUMENT STRUCTURE: When providing document_content, you MUST also provide a structured representation in the "document_structure" field. This allows users to select and attach specific sections, paragraphs, tables, or code snippets.

4. SOURCES: Always include any research papers, articles, websites, or other sources you reference or review. Include URLs, DOIs, or citations in the sources array.

{structure_summary}

SEMANTIC SECTION MATCHING:
When the user asks to add content to an existing section (e.g., "add paragraphs to Introduction" or "add a table to Methodology"), you MUST:
1. Look through the document structure above to find a section with a similar name/title
2. Match semantically - "Introduction" matches "intro", "Introduction", "INTRODUCTION", etc.
3. "Methods" matches "Methodology", "Methods", "Experimental Methods", etc.
4. "Results" matches "Results", "Findings", "Experimental Results", etc.
5. Use the section's ID from the structure (shown in brackets like [sec-introduction])
6. Set placement strategy to "insert_into" with that section's ID as target_id
7. Set parent_id in all new elements to that section's ID
8. DO NOT create a new section if the user is adding content to an existing one

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
- parent_id: ID of parent element (null for top-level sections)
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

PLACEMENT INSTRUCTIONS:
When providing document_content, you MUST also provide "placement" instructions telling where to insert the content:

{{
  "strategy": "insert_after" | "insert_before" | "insert_into" | "insert_at_end",
  "target_id": "element-id" | null,  // ID of existing element to place relative to (null for insert_at_end)
  "position": "beginning" | "end" | null,  // For insert_into strategy only
  "reason": "Brief explanation of why this placement makes sense"
}}

Placement strategies:
- "insert_at_end": Add at the very end of document (use when no specific location needed or for first content)
- "insert_after": Insert after the target element (e.g., Background after Introduction)
- "insert_before": Insert before the target element (e.g., Abstract before Introduction)
- "insert_into": Insert into a section/subsection (use position: "beginning" or "end")

CRITICAL: SEMANTIC MATCHING FOR EXISTING SECTIONS
- ALWAYS check the document structure above to see if a section with a similar name/title already exists
- If the user asks to add paragraphs, subsections, tables, code blocks, or any content to an EXISTING section, you MUST:
  1. Find the existing section ID by matching the section name semantically (even if not exact)
  2. Use "insert_into" strategy with that section's ID as target_id
  3. Set position to "end" to append to the section
  4. Set parent_id in document_structure elements to point to that existing section
  5. DO NOT include the section title/header in document_content - only include the NEW content (paragraphs, tables, etc.)
  6. DO NOT repeat existing content - only include what you are adding
  7. DO NOT create section elements (type="section") when adding to existing sections - only create paragraph, table, code_block, etc. elements
- DO NOT create a new section if the user is adding content to an existing one
- DO NOT include section headers (## Introduction) when adding to existing sections - only include the new paragraphs/content
- When adding to an existing section, document_structure should contain ONLY paragraph/table/code_block/etc elements with parent_id pointing to that section
- Examples:
  - User: "Add two paragraphs to the Introduction section" → 
    * Find "Introduction" section ID (e.g., "sec-introduction")
    * document_content should ONLY contain the two new paragraphs (no "## Introduction" header)
    * document_structure should have two paragraph elements (type="paragraph") with parent_id="sec-introduction"
    * DO NOT create a section element - only paragraph elements
    * placement: {{"strategy": "insert_into", "target_id": "sec-introduction", "position": "end"}}
  - User: "Add a table to Methodology" → 
    * Find "Methodology" section ID, use insert_into with that ID
    * document_content should ONLY contain the table markdown (no section header)
    * document_structure should have one table element (type="table") with parent_id pointing to Methodology section
    * DO NOT create a section element
  - User: "Add a subsection about data collection to Methods" → Find "Methods" or "Methodology" section ID, use insert_into
    * For subsections, you CAN create a subsection element (type="subsection") with parent_id pointing to the Methods section

Special rules:
- References section should always use "insert_at_end" with target_id: null
- Sections should be ordered logically (Introduction → Background → Methodology → Results → Discussion → References)
- Subsections go into their parent section using "insert_into"
- Content elements (paragraphs, tables, code) go into their section/subsection using "insert_into"
- For the first content in an empty document, use "insert_at_end" with target_id: null
- When user explicitly asks to add to an existing section, ALWAYS use "insert_into" with that section's ID

Always respond in JSON format with exactly these keys:
{{
  "message": "your conversational response here (always provide this, even if brief). Use \\n for line breaks.",
  "document_content": "structured markdown content to add (empty string '' if no document update needed). Use \\n for line breaks. IMPORTANT: When adding to an existing section, ONLY include the NEW content - do NOT repeat the section header or existing content.",
  "document_structure": [array of structured elements matching document_content. Empty array [] if no document update needed],
  "placement": {{placement instructions object. Required if document_content is provided, null otherwise}},
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

Remember: The chat message should be conversational and helpful. The document_content should be formal research writing in Markdown format, but ONLY include new content being added. The document_structure should provide granular, selectable elements that match the document_content. Sources should include any papers, articles, or websites you mention or review."""
        
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
        placement = parsed_response.get('placement')
        sources = parsed_response.get('sources', [])
        
        # Store the chat message, sources, and document content in conversation history
        ChatSessionModel.add_message(
            session_id, 
            'assistant', 
            chat_message, 
            sources=sources,
            document_content=document_content_to_add if document_content_to_add.strip() else None,
            document_structure=document_structure if document_structure else None,
            placement=placement
        )
        
        # Smart insertion of document content if provided
        # Auto-append for fresh documents (no existing content)
        is_fresh_document = not document_content.strip()
        
        print(f"DEBUG: document_content_to_add exists: {bool(document_content_to_add.strip())}")
        print(f"DEBUG: document_structure exists: {bool(document_structure)}")
        print(f"DEBUG: is_fresh_document: {is_fresh_document}")
        print(f"DEBUG: placement: {placement}")
        print(f"DEBUG: existing structure roots: {len(document_structure_tree.get('roots', [])) if document_structure_tree else 0}")
        
        if document_content_to_add.strip():
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
        
        return jsonify({
            'response': chat_message,
            'document_content': document_content_to_add,
            'document_structure': document_structure,
            'placement': placement,
            'sources': sources,
            'session_id': session_id,
            'function_calls': function_calls_made if function_calls_made else None
        }), 200
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error in send_message: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500


