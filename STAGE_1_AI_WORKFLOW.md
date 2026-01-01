# Stage 1 AI - Complete Workflow Documentation

## Overview

Stage 1 AI is the **Content Generation** component of the research platform's two-stage AI system. It is responsible for generating research content, answering questions, and providing conversational assistance. Stage 1 AI uses the Perplexity API (specifically the `sonar-pro` model) to provide grounded, web-search-enabled responses.

**Key Distinction**: Stage 1 AI generates content only - it does NOT decide where content should be placed in the document. Content placement is handled by Stage 2 AI (OpenAI GPT-4) when the user approves the generated content.

---

## Core Responsibilities

Stage 1 AI has three main responsibilities:

1. **Chat Message Generation**: Provide conversational, helpful responses for the chat interface - answering questions, discussing ideas, and providing relevant snippets from the document.

2. **Document Content Generation**: When the user's request requires adding or updating the research document, generate well-structured, formal research content in Markdown format. The AI's ONLY job is to generate high-quality content - it does NOT provide placement instructions or decide where content goes.

3. **Source Tracking**: Always include any research papers, articles, websites, or other sources referenced or reviewed in the sources array.

---

## Technology Stack

- **AI Provider**: Perplexity AI
- **Model**: `sonar-pro` (research-quality responses)
- **API**: Perplexity Chat Completions API with structured JSON output
- **Service Class**: `PerplexityService` (located in `backend/services/perplexity_service.py`)

---

## Complete Workflow

### Step 1: Request Reception

When a user sends a message via the `/api/chat/message` endpoint:

1. Extract user authentication token
2. Validate session ownership
3. Extract message data:
   - `session_id`: The chat session identifier
   - `message`: The user's message text
   - `mode`: Either "write" or "research" (defaults to "write")
   - `attached_sections`: Optional array of attached document sections or highlights

### Step 2: Highlight Processing

If the user attached highlights or sections:

1. Extract highlights from `attached_sections`
2. Filter for items with `type == 'highlight'` or content starting with `'Highlight:'`
3. Extract highlight text, notes, and sources
4. Format highlights as a block:
   ```
   [ATTACHED_HIGHLIGHTS]
   - Highlight text 1 (Note: ...; Source: ...)
   - Highlight text 2 (Note: ...; Source: ...)
   ```
5. Append highlights block to the user message

### Step 3: Document Context Retrieval

The system retrieves relevant document context using **semantic search**:

1. Load full document content from `backend/data/sessions/{session_id}/doc.md` (if exists)
2. If document exists:
   - Use `VectorService.search_relevant_chunks()` to find top 5 most relevant chunks
   - Query is the user's message (for semantic similarity matching)
   - Returns chunks ranked by cosine similarity to the query
   - If no relevant chunks found, fallback to full document
3. If document doesn't exist:
   - Set context to empty document message

**Semantic Search Details**:
- Documents are chunked into ~1000 character pieces with 100 character overlap
- Each chunk is embedded using OpenAI embeddings
- Query embedding is compared to all chunk embeddings using cosine similarity
- Top 5 most similar chunks are returned

### Step 4: Document Structure Retrieval

1. Get document structure from database: `DocumentModel.get_document_structure(session_id)`
2. Build structure tree using `DocumentStructureService.build_tree()`
3. Generate structure summary using `DocumentStructureService.get_structure_summary()`
4. If no structure exists, use empty structure

### Step 5: Document Types Preparation

1. Retrieve all available document types from database: `DocumentTypeModel.get_all_types()`
2. Format as a list:
   ```
   - section: Main section heading (##)
   - subsection: Subsection heading (###)
   - paragraph: Regular paragraph text
   - table: Markdown table
   - code_block: Code snippet with syntax highlighting
   ...
   ```

### Step 6: Pending Content Context (if applicable)

If there is pending content awaiting approval:

1. Retrieve pending content data: `ChatSessionModel.get_pending_content(session_id)`
2. Extract previous content and sources
3. Add revision context to system prompt instructing AI to:
   - Keep all previous content unless explicitly asked to change it
   - Only modify the specific part the user is asking to change
   - Return COMPLETE content including both unchanged and modified parts

### Step 7: Conversation History Processing

1. Retrieve all messages from the session: `ChatSessionModel.get_messages(session_id)`
2. Identify the last user message (current instruction)
3. Mark messages clearly:
   - Current instruction: `[CURRENT INSTRUCTION - RESPOND TO THIS ONLY]`
   - Historical messages: `[HISTORICAL CONTEXT - DO NOT ACT ON THIS - FOR REFERENCE ONLY]`
4. Ensure strict alternation between user/assistant messages (Perplexity requirement)

### Step 8: System Prompt Construction

The system prompt is dynamically built based on the mode and available context.

#### Write Mode System Prompt Structure

```
You are a research assistant helping users write research papers. Your role is to GENERATE CONTENT ONLY - you do NOT decide where content should be placed in the document.

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

[DOCUMENT CONTEXT SECTION - dynamically inserted here]

SEMANTIC SECTION MATCHING FOR CONTENT GENERATION:
When the user asks to add content to an existing section (e.g., "add paragraphs to Introduction" or "add a table to Methodology"), you should:
1. Look through the document content above to understand the context
2. Match semantically - "Introduction" matches "intro", "Introduction", "INTRODUCTION", etc.
3. "Methods" matches "Methodology", "Methods", "Experimental Methods", etc.
4. "Results" matches "Results", "Findings", "Experimental Results", etc.
5. DO NOT include the section title/header in document_content when adding to existing sections - only include the NEW content

AVAILABLE DOCUMENT TYPES:
[DYNAMIC LIST OF TYPES]

NEW DOCUMENT TYPES:
If you need a document element type that doesn't exist in the list above, include it in your JSON response under "new_types"...

MARKDOWN FORMATTING GUIDELINES:
- Use headers: # for main title, ## for sections, ### for subsections
- Use **bold** for emphasis and *italic* for subtle emphasis
- Use bullet points (-) or numbered lists (1.) for lists
- Use code blocks with language tags: ```python for code examples (ALWAYS include language tag)
- Use tables with Markdown table syntax: | Column 1 | Column 2 |\n|--------|----------|\n| Value 1 | Value 2 |
- Use > for blockquotes when citing sources
- Use [link text](url) for references
- Keep paragraphs separated by blank lines

[EXAMPLES SECTION]

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
- ALL newlines within string values MUST be escaped as \n (backslash followed by n)
- ALL quotes within string values MUST be escaped as \" (backslash followed by quote)
- ALL backslashes within string values MUST be escaped as \\ (double backslash)
- Do NOT include actual newline characters inside JSON string values
- The JSON must be on a single line OR properly formatted with escaped newlines

CRITICAL: CONTENT GENERATION ONLY - NO PLACEMENT
- Your ONLY job is to generate high-quality research content
- Do NOT provide placement instructions or decide where content should go
- Do NOT include a "placement" field in your response
- Focus on generating well-structured, accurate, properly formatted content
- When adding to an existing section, ONLY include the NEW content (no section headers, no existing content)

Always respond in JSON format with exactly these keys:
{
  "message": "your conversational response here (always provide this, even if brief). Use \n for line breaks.",
  "document_content": "structured markdown content to add (empty string '' if no document update needed). Use \n for line breaks. IMPORTANT: When adding to an existing section, ONLY include the NEW content - do NOT repeat the section header or existing content.",
  "sources": ["array of source URLs, DOIs, or citations you referenced or reviewed. Empty array [] if no sources"],
  "new_types": [array of new document types to create. Empty array [] if no new types needed. Each type: {"type_name": "name", "description": "desc", "metadata_schema": {}}]
}

CRITICAL: CONTENT SCOPE RULES
- When adding content to an EXISTING section: document_content should ONLY contain the new paragraphs/tables/content you are adding
- DO NOT include section headers (## Section Name) when adding to existing sections
- DO NOT repeat existing paragraphs or content that's already in the document
- Only include what is NEW and being added in this response
```

#### Research Mode System Prompt Structure

Research mode uses a simpler prompt focused on Q&A:

```
You are a research assistant focused on producing concise, well-sourced answers.

MODE: RESEARCH
- PRIMARY: Deliver the researched answer now. Do NOT say you will research; provide findings directly.
- Keep answers succinct and structured (short paragraphs or bullets).
- ALWAYS include sources (URLs/DOIs) in the "sources" array for any claim or fact.
- Use document_content/document_structure ONLY if the user explicitly asks for prose to be drafted/inserted. Otherwise, keep document_content empty.
- If drafting content, follow the document structure guidance exactly and include sources.

CRITICAL: PLAIN TEXT FORMATTING REQUIREMENTS
- Your "message" response MUST be in PLAIN TEXT format - NO markdown formatting whatsoever EXCEPT for subheadings
- DO NOT use markdown syntax like *italic*, # headers, or other markdown characters
- For SUBHEADINGS: Use **bold** markers around subheading text. Subheadings should NOT have bullet points before them.
- For bullet points: Each bullet point MUST be on its own separate line. Use a dash and space ("- ") at the start of each bullet point.
- NEVER put multiple bullet points on the same line.
- For paragraphs: Separate paragraphs with blank lines (double newlines)
...

Context from the user's document (if any):
[DOCUMENT CONTEXT]

Document structure summary:
[STRUCTURE SUMMARY]

Available document types:
[TYPES LIST]
...
```

### Step 9: Message Array Construction

The messages array is built as follows:

1. **System Message**: Contains the complete system prompt
2. **Conversation History**: All previous messages with clear markers:
   - Current instruction marked with `[CURRENT INSTRUCTION - RESPOND TO THIS ONLY]`
   - Historical messages marked with `[HISTORICAL CONTEXT - DO NOT ACT ON THIS - FOR REFERENCE ONLY]`
3. **Message Alternation**: Ensure strict user/assistant alternation (merge consecutive messages of same role)

### Step 10: API Call to Perplexity

The system calls `PerplexityService.chat_completion()`:

**API Configuration**:
- Model: `sonar-pro`
- Temperature: 0.7 (default)
- Response Format: Structured JSON using JSON Schema

**JSON Schema Enforced**:
```json
{
  "type": "object",
  "properties": {
    "message": {"type": "string"},
    "document_content": {"type": "string"},
    "document_structure": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "type": {"type": "string"},
          "content": {"type": "string"},
          "parent_id": {"type": ["string", "null"]},
          "metadata": {"type": "object"}
        }
      }
    },
    "sources": {
      "type": "array",
      "items": {"type": "string"}
    },
    "new_types": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type_name": {"type": "string"},
          "description": {"type": "string"},
          "metadata_schema": {"type": "object"}
        }
      }
    }
  },
  "required": ["message", "document_content", "document_structure", "sources", "new_types"]
}
```

### Step 11: Response Parsing

The response is parsed using `PerplexityService.parse_json_response()`:

1. Extract JSON block from response (handles extra text)
2. Attempt standard JSON parsing
3. If parsing fails, apply fuzzy parsing:
   - Fix unescaped newlines and control characters
   - Retry JSON parsing
4. If still fails, use regex-based extraction as last resort
5. Extract fields:
   - `message`: Conversational response
   - `document_content`: Markdown content to add
   - `document_structure`: Array of structured elements (currently not used, but parsed)
   - `sources`: Array of source URLs/DOIs/citations
   - `new_types`: Array of new document types to create

### Step 12: New Document Type Creation

If `new_types` array contains new types:

1. For each new type:
   - Call `DocumentTypeModel.create_type()`
   - Parameters: `type_name`, `description`, `metadata_schema`, `is_system=False`
   - Store in database
2. Log creation success/failure

### Step 13: Response Processing (Research Mode)

If mode is "research":

1. Strip markdown formatting from `message` field using `strip_markdown_to_plain_text()`
2. Convert to plain text format:
   - Remove markdown headers (#, ##, ###)
   - Preserve subheadings as bold (**text**)
   - Ensure bullet points are on separate lines
   - Remove code blocks, inline code, links, images
   - Normalize formatting

### Step 14: Content Storage

If `document_content` is not empty:

1. **Status**: Set to `"pending_approval"`
2. **Session Start Timestamp**: Track when user first requested content (for collecting all messages in session)
3. **Store Pending Content**: 
   - Call `ChatSessionModel.update_pending_content()`
   - Store: `document_content`, `sources`, `session_start_timestamp`
4. **Store Assistant Message**:
   - Role: `assistant`
   - Content: `chat_message`
   - Sources: `sources`
   - Document Content: `document_content`
   - Status: `pending_approval`
   - Placement: `None` (Stage 1 doesn't handle placement)

If `document_content` is empty:

1. Store regular chat message (no pending content)
2. Status: `None`

### Step 15: Response to Client

Return JSON response:

```json
{
  "response": "chat message text",
  "document_content": "markdown content or empty string",
  "sources": ["url1", "url2", ...],
  "session_id": "session-id",
  "status": "pending_approval" (if content generated),
  "pending_content_id": "id" (if content generated)
}
```

---

## Special Cases

### Rewrite Request

When user requests a rewrite of rejected content (`/api/chat/rewrite`):

1. Similar workflow to main flow
2. System prompt includes:
   - Original user request
   - Previous rejected content
   - Instruction to generate new content addressing the same request
   - Instruction to consider why previous content might have been rejected

### Revision Context

If pending content exists and user sends a new message:

1. System prompt includes revision context
2. Instructions to:
   - Keep ALL previous content unless explicitly asked to change
   - Only modify specific part user is asking to change
   - Return COMPLETE content (unchanged + modified parts)

---

## Data Flow Summary

```
User Message
    ↓
[Extract Highlights]
    ↓
[Get Document Context via Semantic Search]
    ↓
[Get Document Structure & Types]
    ↓
[Build System Prompt]
    ↓
[Build Message Array with History]
    ↓
[Call Perplexity API]
    ↓
[Parse JSON Response]
    ↓
[Create New Types (if any)]
    ↓
[Process Response (strip markdown for research mode)]
    ↓
[Store as Pending Content]
    ↓
[Return to Client]
```

---

## Key System Prompt Components

### Document Context Section

**When document exists**:
```
The user has been building a research document. Here are the most relevant sections (retrieved using semantic search):

[Relevant document chunks]

NOTE: Only relevant document sections are shown above based on semantic similarity to the user's query. If you need information from other parts of the document, ask the user or indicate what additional context might be needed.
```

**When document is empty**:
```
The document is currently empty - the user is starting a new research paper.
```

### Semantic Section Matching Instructions

The AI is instructed to:
- Match section names semantically (e.g., "Introduction" matches "intro", "Introduction", "INTRODUCTION")
- Understand variations (e.g., "Methods" matches "Methodology", "Methods", "Experimental Methods")
- When adding to existing sections: ONLY include NEW content, NOT section headers or existing content

### Content Generation Rules

**Critical Constraints**:
- Generate content ONLY - no placement decisions
- When adding to existing sections: exclude section headers
- Include only NEW content, not repeats of existing content
- Sources go in `sources` array, NOT in `document_content`
- Clean research writing without URLs or citations in content

### JSON Formatting Requirements

**Strict Requirements**:
- Valid JSON only - no extra text
- All newlines escaped as `\n`
- All quotes escaped as `\"`
- All backslashes escaped as `\\`
- Single line or properly formatted with escaped newlines

---

## Output Format

Stage 1 AI always returns JSON with these fields:

```json
{
  "message": "string - conversational response",
  "document_content": "string - markdown content (empty if no content to add)",
  "document_structure": "array - structured elements (currently parsed but not actively used)",
  "sources": ["array", "of", "source", "URLs", "DOIs", "or", "citations"],
  "new_types": [
    {
      "type_name": "string",
      "description": "string",
      "metadata_schema": {}
    }
  ]
}
```

**Field Descriptions**:
- `message`: Always provided, conversational response for chat interface
- `document_content`: Markdown-formatted research content, empty string if no document update needed
- `document_structure`: Array of structured document elements (for future use)
- `sources`: Array of source URLs, DOIs, or citations that were referenced or reviewed
- `new_types`: Array of new document types to create (if any)

---

## Integration with Stage 2 AI

Stage 1 AI is **completely separate** from Stage 2 AI:

- **Stage 1**: Generates content, stores as pending
- **Stage 2**: Takes approved content and places it in document

When user approves content:
1. Content is sent to Stage 2 AI (OpenAI GPT-4)
2. Stage 2 AI receives:
   - Full current document content
   - Approved content to place
   - All user messages from the session (to find placement instructions)
3. Stage 2 AI decides placement and merges content
4. Updated document is saved

---

## Error Handling

### API Errors

If Perplexity API call fails:
1. Exception is caught and logged
2. Error traceback is printed
3. HTTP 500 error returned to client

### JSON Parsing Errors

If JSON parsing fails:
1. Attempt fuzzy parsing (fix unescaped characters)
2. If still fails, use regex-based extraction
3. If all parsing fails, treat entire response as `message` field

### Fallback Behavior

- If semantic search returns no chunks: fallback to full document
- If document doesn't exist: provide empty document context message
- If parsing completely fails: use raw response as message

---

## Configuration

**Model**: `sonar-pro` (configurable in `PerplexityService.__init__()`)
**Temperature**: 0.7 (default, configurable in `chat_completion()`)
**Top K for Semantic Search**: 5 chunks (configurable in `send_message()`)
**Chunk Size**: 1000 characters (in `VectorService`)
**Chunk Overlap**: 100 characters (in `VectorService`)

---

## Notes

1. **No Placement Logic**: Stage 1 AI explicitly does NOT handle placement - this is Stage 2's responsibility
2. **Semantic Search**: Only relevant document chunks are sent to reduce token usage and improve relevance
3. **Message Alternation**: Perplexity requires strict user/assistant alternation - consecutive messages of same role are merged
4. **Current vs Historical**: System prompt explicitly instructs AI to only respond to current message, not historical ones
5. **Complete Content for Revisions**: When revising, AI must return complete content (unchanged + modified parts), not just the modified part
6. **Source Separation**: Sources are kept separate from document content - document_content should be clean research writing

---

## Performance Considerations: Why Perplexity May Take ~15 Seconds

While the input/output tokens may be minimal, there are several factors that contribute to Perplexity API response times of around 15 seconds:

### 1. **Real-Time Web Search (Primary Factor)**

Perplexity's `sonar-pro` model performs **real-time web searches** to ground its responses with current information. This is a key differentiator from standard language models:

- Perplexity actively searches the web during response generation
- Multiple search queries may be executed to gather information
- Search results are retrieved, processed, and integrated into the response
- This web search process typically adds 5-10 seconds to response time
- The search happens synchronously as part of the API call

**Impact**: This is likely the **largest contributor** to the 15-second response time, as web search is inherently slower than pure text generation.

### 2. **Document Context Size**

Even with semantic search limiting to top 5 chunks, the document context can still be substantial:

- Each chunk is ~1000 characters (with 100 character overlap)
- 5 chunks = ~5000 characters of document context
- With semantic search fallback, full document could be sent if no relevant chunks found
- Document context is embedded in the system prompt, increasing input tokens

**Impact**: Larger document contexts increase input token count, which requires more processing time, though this is typically less significant than web search.

### 3. **System Prompt Size**

The system prompt is comprehensive and includes:

- Full role definition and responsibilities
- Document context (potentially large)
- Available document types list (can be lengthy)
- Markdown formatting guidelines
- JSON formatting rules
- Multiple examples and rules
- Semantic section matching instructions
- Content scope rules

**Estimated Size**: The system prompt alone can be 2000-4000 tokens depending on document context and number of document types.

**Impact**: Larger system prompts require more initial processing by the model.

### 4. **Conversation History**

All historical messages are included in the API call:

- Every user message and assistant response from the session
- Messages are marked but still included in the context
- Long conversation histories can add thousands of tokens
- Even though AI is told to only respond to current message, history is still processed

**Impact**: Long conversation histories significantly increase input tokens and processing time.

### 5. **JSON Schema Enforcement**

The API uses structured output with JSON Schema enforcement:

- Perplexity must format the response according to the strict JSON schema
- All string values must have properly escaped newlines, quotes, and backslashes
- Response must be valid JSON with all required fields
- The model must generate content that conforms to the schema structure

**Impact**: Structured output adds computational overhead compared to free-form text generation.

### 6. **Model Latency (sonar-pro)**

The `sonar-pro` model itself has inherent latency:

- Higher-quality models typically have higher latency
- `sonar-pro` is optimized for research-quality responses, not speed
- The model processes the entire context before generating output
- Response generation itself takes time based on output length

**Impact**: Model processing time is a baseline that cannot be eliminated.

### 7. **Network Latency**

API call overhead includes:

- Round-trip network time to Perplexity's servers
- Request serialization and transmission
- Response deserialization
- Network conditions and geographical distance from API servers

**Impact**: Typically 0.5-2 seconds, but can vary based on network conditions.

### 8. **Response Processing and Validation**

After receiving the response:

- JSON parsing and validation
- Error handling and fuzzy parsing if needed
- Response field extraction and validation
- Processing for research mode (markdown stripping)

**Impact**: Minimal (~100-500ms), but adds to total perceived latency.

### 9. **Semantic Search Overhead (Prior to API Call)**

Before calling Perplexity, the system performs:

- Vector embedding generation for the user query
- Cosine similarity calculations against all document chunks
- Retrieval and ranking of top 5 chunks
- Context assembly

**Impact**: Typically 200-800ms before the Perplexity API is even called.

### Summary: Estimated Time Breakdown

Based on the factors above, a typical ~15 second response time breakdown might be:

1. **Real-time web search**: 5-10 seconds (largest contributor)
2. **Model processing** (including system prompt, context, history): 3-5 seconds
3. **Network latency**: 0.5-2 seconds
4. **Semantic search (pre-processing)**: 0.2-0.8 seconds
5. **Response parsing and validation**: 0.1-0.5 seconds
6. **Other overhead**: 0.2-0.7 seconds

**Total**: ~9-19 seconds (with ~15 seconds being typical)

### Optimization Opportunities

To reduce response time:

1. **Limit web search scope**: Consider if web search is always needed for all queries
2. **Reduce conversation history**: Implement message truncation or summarization for very long histories
3. **Optimize document context**: Ensure semantic search is working effectively (it already limits to 5 chunks)
4. **Consider faster model**: Use `sonar` instead of `sonar-pro` for faster responses (lower quality)
5. **Cache frequent queries**: Implement response caching for common queries
6. **Stream responses**: Use streaming API if available to show partial results faster
7. **Reduce system prompt size**: Condense system prompt while maintaining critical instructions

**Note**: The web search feature is a core value proposition of Perplexity, so eliminating it would remove the primary benefit. The ~15 second response time is likely acceptable given the research-quality, grounded responses that Perplexity provides.

