"""
Agentic OpenAI Service for Phase 0

This service implements OpenAI Agents SDK with OpenAI as the main agent.
Phase 0: Basic agent setup without tools (for initial testing).
"""

import os
import sys
import json
import asyncio
import threading
from typing import List, Dict, Optional
from datetime import datetime

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config import Config
from utils.logger import get_logger, log_error
from utils.agent_step_registry import (
    create_step_data, compute_step_description,
    STEP_ID_START_PROCESSING, STEP_ID_SELECTING_TOOLS,
    STEP_ID_CALLING_PERPLEXITY, STEP_ID_SEARCHING_PERPLEXITY,
    STEP_ID_CALLING_VECTOR_DB, STEP_ID_SEARCHING_VECTOR_DB,
    STEP_ID_PROCESSING_TOOL_RESULTS, STEP_ID_EXTRACTING_SOURCES,
    STEP_ID_VALIDATING_FORMAT, STEP_ID_ENSURING_FIELDS, STEP_ID_FINALIZING,
    STEP_TYPE_THINKING, STEP_TYPE_TOOL_CALL, STEP_TYPE_PROCESSING
)

logger = get_logger(__name__)

# Import nest_asyncio (but don't apply globally)
# We'll apply it conditionally in function tools when needed
try:
    import nest_asyncio
    _nest_asyncio_available = True
except ImportError:
    _nest_asyncio_available = False
    logger.warning("nest_asyncio not available - nested event loops may fail in function tools")

# Patch sniffio to properly detect asyncio in our context
# This fixes the "unknown async library" error when using OpenAI SDK
try:
    import sniffio
    # Monkey patch sniffio to detect asyncio properly
    original_current_async_library = sniffio.current_async_library
    
    def patched_current_async_library():
        try:
            # Try to get running loop - if we can, we're in asyncio context
            asyncio.get_running_loop()
            return "asyncio"
        except RuntimeError:
            # No running loop, but check if we're in an async context
            try:
                # Try to get current task
                asyncio.current_task()
                return "asyncio"
            except RuntimeError:
                # Fall back to original implementation
                try:
                    return original_current_async_library()
                except:
                    # If all else fails, assume asyncio
                    return "asyncio"
    
    sniffio.current_async_library = patched_current_async_library
    logger.debug("Patched sniffio to properly detect asyncio")
except Exception as e:
    logger.warning(f"Failed to patch sniffio: {e}")

# Note: With async routes, we don't need to patch anyio since we're in a proper async context

# Import services for function tools
from services.vector_service import VectorService
from services.sse_service import SSEService
vector_service = VectorService()

try:
    from agents import Agent, Runner, function_tool, OpenAIChatCompletionsModel, set_tracing_disabled
    from openai import AsyncOpenAI
    # Disable tracing to avoid platform tracing key issues
    set_tracing_disabled(disabled=True)
except ImportError:
    logger.error("openai-agents package not installed. Please install it: pip install openai-agents")
    raise


# Store session_id and project_id in a thread-local or context for function tools
import threading
_context = threading.local()

def get_session_id():
    """Get current session_id from context"""
    return getattr(_context, 'session_id', None)

def set_session_id(session_id):
    """Set current session_id in context"""
    _context.session_id = session_id

def get_project_id():
    """Get current project_id from context"""
    return getattr(_context, 'project_id', None)

def set_project_id(project_id):
    """Set current project_id in context"""
    _context.project_id = project_id


class AgenticOpenAIService:
    """
    Service for using OpenAI Agents SDK with OpenAI as the main agent.
    
    Phase 0: Agent with Perplexity and vector search function tools.
    """
    
    def __init__(self):
        """Initialize the agentic service."""
        if not Config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        
        # Model choice: gpt-4o-mini for cost-effectiveness
        self.model_name = "gpt-4o-mini"
        
        # Create AsyncOpenAI client for OpenAI (main agent)
        # Using Chat Completions API instead of Responses API to avoid sniffio detection issues
        self.openai_client = AsyncOpenAI(
            api_key=Config.OPENAI_API_KEY
        )
        
        # Create model using OpenAIChatCompletionsModel (Chat Completions API)
        # This avoids the sniffio async detection issues with Responses API
        self.model = OpenAIChatCompletionsModel(
            model=self.model_name,
            openai_client=self.openai_client
        )
        
        # Base instructions - will be enhanced with system message dynamically
        # CRITICAL: Emphasize strict JSON formatting
        self.base_instructions = """You are a helpful research assistant. 

CRITICAL JSON FORMATTING RULES:
- You MUST respond with ONLY valid JSON - no markdown code blocks, no explanations, no extra text
- The JSON must start with { and end with }
- All string values MUST be properly quoted with double quotes
- Escape special characters: \\n for newlines, \\" for quotes, \\\\ for backslashes
- The "message" field is REQUIRED and must never be empty
- Extract URLs from tool outputs (especially perplexity_research) and put them in the "sources" array

Always respond in valid JSON format with this exact structure:
{
  "message": "your response",
  "document_content": "",
  "sources": [],
  "new_types": []
}"""
        
        # Create function tools (will be recreated with user_id/session_id when needed)
        self._create_function_tools()
        
        # Create agent with function tools
        # Instructions will be updated dynamically based on system message
        self.agent = Agent(
            name="Research Assistant",
            instructions=self.base_instructions,
            model=self.model,  # Use OpenAIChatCompletionsModel instead of string
            tools=[self.perplexity_research_tool, self.search_vector_database_tool, self.get_pdfs_tool, self.get_highlights_tool]
        )
        
        logger.info("AgenticOpenAIService initialized with OpenAI agent (Chat Completions API) and function tools (perplexity_research, search_vector_database, get_pdfs, get_highlights)")
    
    def _create_function_tools(self, user_id: Optional[str] = None, session_id: Optional[str] = None, collect_step_fn=None):
        """Create function tools with proper async handling
        
        Args:
            user_id: User ID for SSE broadcasting
            session_id: Session ID for SSE broadcasting
            collect_step_fn: Optional function to collect SSE steps for persistence
        """
        
        @function_tool
        def perplexity_research(query: str) -> str:
            """
            Search the web for current information, research, or citations using Perplexity Sonar Pro.
            
            Use this tool when the user asks questions requiring:
            - Current web information
            - Recent research or news
            - Citations or sources
            - Real-time data
            
            Args:
                query: The research question or topic that requires web search, current information, or citations
            
            Returns:
                Formatted string with research results and sources
            """
            try:
                logger.info(f"[TOOL CALLED] perplexity_research with query: {query[:100]}...")
                
                # Emit comprehensive SSE events for Perplexity tool execution
                if user_id:
                    # Step 1: Tool selection
                    step1 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': 'Deciding to use Perplexity for web research...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step1)
                    if collect_step_fn:
                        collect_step_fn(step1)
                    
                    # Step 2: Searching
                    step_description = f"Searching Perplexity for: {query[:100]}{'...' if len(query) > 100 else ''}"
                    step2 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': step_description,
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step2)
                    if collect_step_fn:
                        collect_step_fn(step2)
                    
                    # Step 3: Calling API
                    step3 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': 'Calling Perplexity Sonar Pro API...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step3)
                    if collect_step_fn:
                        collect_step_fn(step3)
                    
                    # Step 4: Waiting
                    step4 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': 'Waiting for Perplexity search results...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step4)
                    if collect_step_fn:
                        collect_step_fn(step4)
                
                if not Config.PERPLEXITY_API_KEY:
                    return "Error: Perplexity API key not configured"
                
                # Create AsyncOpenAI client for Perplexity
                client = AsyncOpenAI(
                    base_url="https://api.perplexity.ai",
                    api_key=Config.PERPLEXITY_API_KEY
                )
                
                # Call Perplexity Sonar Pro
                # Function tools are called from within async context, so we need to handle nested event loops
                logger.debug(f"Calling Perplexity API with query: {query[:100]}...")
                
                async def _call_perplexity():
                    response = await client.chat.completions.create(
                        model="sonar-pro",
                        messages=[{"role": "user", "content": query}]
                    )
                    return response
                
                # Try to get existing loop (we're in async context from agent execution)
                # Function tools are called from within async agent execution
                try:
                    loop = asyncio.get_running_loop()
                    # We're in an async context - need to use a different approach
                    # Since we can't use run_until_complete on a running loop without nest_asyncio,
                    # we'll create a new event loop in a thread for this call
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as executor:
                        future = executor.submit(asyncio.run, _call_perplexity())
                        response = future.result()
                except RuntimeError:
                    # No event loop running - can use asyncio.run()
                    response = asyncio.run(_call_perplexity())
                
                # Emit step: Received results
                if user_id:
                    step5 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': 'Received results from Perplexity...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step5)
                    if collect_step_fn:
                        collect_step_fn(step5)
                
                # Extract response content
                content = response.choices[0].message.content if response.choices else ""
                
                # Extract citations if available
                citations = []
                if hasattr(response, 'citations') and response.citations:
                    citations = response.citations
                elif hasattr(response, 'citations') and isinstance(response.citations, list):
                    citations = response.citations
                
                # Emit steps: Processing results
                if user_id:
                    step6 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': 'Processing Perplexity search results...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step6)
                    if collect_step_fn:
                        collect_step_fn(step6)
                    
                    if citations:
                        step7 = {
                            'type': 'tool_call',
                            'tool_name': 'perplexity_research',
                            'description': f'Found {len(citations)} citations in Perplexity results...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                        SSEService.broadcast_to_user(user_id, 'agent_step', step7)
                        if collect_step_fn:
                            collect_step_fn(step7)
                        
                        step8 = {
                            'type': 'tool_call',
                            'tool_name': 'perplexity_research',
                            'description': 'Extracting citations from Perplexity results...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                        SSEService.broadcast_to_user(user_id, 'agent_step', step8)
                        if collect_step_fn:
                            collect_step_fn(step8)
                    
                    step9 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': 'Formatting Perplexity research results...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step9)
                    if collect_step_fn:
                        collect_step_fn(step9)
                
                # Format response
                result = f"Research Results: {content}"
                if citations:
                    citations_str = "\n".join([f"- {cite}" for cite in citations])
                    result += f"\n\nSources:\n{citations_str}"
                
                # Emit completion step
                if user_id:
                    step10 = {
                        'type': 'tool_call',
                        'tool_name': 'perplexity_research',
                        'description': 'Perplexity search completed successfully...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step10)
                    if collect_step_fn:
                        collect_step_fn(step10)
                
                logger.debug(f"Perplexity research completed, citations: {len(citations)}")
                return result
                
            except Exception as e:
                log_error(logger, e, "Error in perplexity_research function tool")
                return f"Error performing research: {str(e)}"
        
        @function_tool
        def search_vector_database(query: str, source_types: str = None) -> str:
            """
            Search the user's saved documents, highlights, PDFs, and images using semantic search.
            
            ALWAYS use this tool when the user:
            - Asks to summarize their document ("summarize my document", "summarize the document")
            - Asks about their documents ("what did I write about X", "what's in my document")
            - Mentions "my document", "the document", "my saved content", "my highlights"
            - Asks to find information from their saved content
            - Wants to know what they've written or saved
            - Asks about highlights, PDFs, or images they've uploaded
            
            This tool searches through the user's actual saved documents, highlights, PDFs, and images.
            If the user asks about THEIR content, you MUST call this tool first.
            
            Args:
                query: The search query to find relevant content (use the user's question or topic)
                source_types: Optional comma-separated string of source types to filter by:
                    - "research_document" for research documents
                    - "highlight" for highlights
                    - "pdf" for PDF full text
                    - "image_ocr" for image OCR text
                    - Leave empty or omit to search all sources
            
            Returns:
                Formatted string with relevant document chunks from the user's documents, highlights, PDFs, and images
            """
            try:
                logger.info(f"[TOOL CALLED] search_vector_database with query: {query[:100]}...")
                
                # Emit comprehensive SSE events for vector database tool execution
                if user_id:
                    # Step 1: Tool selection
                    step1 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': 'Deciding to search your documents...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step1)
                    if collect_step_fn:
                        collect_step_fn(step1)
                    
                    # Step 2: Searching
                    step_description = f"Searching your documents for: {query[:100]}{'...' if len(query) > 100 else ''}"
                    step2 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': step_description,
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step2)
                    if collect_step_fn:
                        collect_step_fn(step2)
                    
                    # Step 3: Querying database
                    step3 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': 'Querying vector database...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step3)
                    if collect_step_fn:
                        collect_step_fn(step3)
                    
                    # Step 4: Searching through content
                    step4 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': 'Searching through your saved content...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step4)
                    if collect_step_fn:
                        collect_step_fn(step4)
                
                # Get session_id and project_id from context
                session_id_from_context = get_session_id()
                project_id_from_context = get_project_id()
                logger.debug(f"Session ID from context: {session_id_from_context}, Project ID: {project_id_from_context}")
            
                # Use session_id from parameter if available, otherwise from context
                search_session_id = session_id if session_id else session_id_from_context
                
                # Parse source_types if provided
                source_types_list = None
                if source_types:
                    # Parse comma-separated string into list
                    source_types_list = [s.strip() for s in source_types.split(',') if s.strip()]
                    logger.debug(f"Filtering by source types: {source_types_list}")
                
                # For multi-source search, we need user_id and project_id
                if user_id and project_id_from_context:
                    # Use multi-source search with filters
                    logger.debug(f"Using multi-source search with user_id={user_id}, project_id={project_id_from_context}")
                    relevant_chunks = vector_service.search_relevant_chunks(
                        session_id=search_session_id or '',  # Still pass for backward compatibility
                        query=query,
                        top_k=5,
                        user_id=user_id,
                        project_id=project_id_from_context,
                        source_types=source_types_list
                    )
                elif search_session_id:
                    # Backward compatibility: search by session_id only
                    logger.debug(f"Using backward-compatible search by session_id only")
                    relevant_chunks = vector_service.search_relevant_chunks(search_session_id, query, top_k=5)
                else:
                    logger.warning("Neither user_id/project_id nor session_id available for vector search")
                    return "Error: Session ID or user context not available. Cannot search documents."
                
                logger.debug(f"Searching vector database with query: {query[:100]}...")
                
                # Emit step: Retrieving chunks
                if user_id:
                    step5 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': 'Retrieving relevant document chunks...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step5)
                    if collect_step_fn:
                        collect_step_fn(step5)
                
                if not relevant_chunks:
                    if user_id:
                        step6 = {
                            'type': 'tool_call',
                            'tool_name': 'search_vector_database',
                            'description': 'Vector database search completed...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                        SSEService.broadcast_to_user(user_id, 'agent_step', step6)
                        if collect_step_fn:
                            collect_step_fn(step6)
                    return "No relevant content found in your documents."
                
                # Emit step: Found chunks
                if user_id:
                    step6 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': f'Found {len(relevant_chunks)} relevant chunks in your documents...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step6)
                    if collect_step_fn:
                        collect_step_fn(step6)
                    
                    # Step: Processing results
                    step7 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': 'Processing document search results...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step7)
                    if collect_step_fn:
                        collect_step_fn(step7)
                
                # Format results with source type information
                results = []
                for i, chunk in enumerate(relevant_chunks, 1):
                    chunk_text = chunk.get('chunk_text', '')
                    similarity = chunk.get('similarity', 0)
                    source_type = chunk.get('source_type', 'document')
                    
                    # Format source type for display
                    source_label = {
                        'research_document': 'Document',
                        'highlight': 'Highlight',
                        'pdf': 'PDF',
                        'image_ocr': 'Image OCR'
                    }.get(source_type, 'Document')
                    
                    results.append(f"[{source_label} - Chunk {i}, Similarity: {similarity:.2f}]\n{chunk_text}")
                
                # Emit step: Formatting results
                if user_id:
                    SSEService.broadcast_to_user(
                        user_id,
                        'agent_step',
                        {
                            'type': 'tool_call',
                            'tool_name': 'search_vector_database',
                            'description': 'Formatting document search results...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    )
                
                result = f"Found {len(relevant_chunks)} relevant chunks from your documents:\n\n" + "\n\n---\n\n".join(results)
                
                # Emit completion step
                if user_id:
                    step8 = {
                        'type': 'tool_call',
                        'tool_name': 'search_vector_database',
                        'description': 'Vector database search completed...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step8)
                    if collect_step_fn:
                        collect_step_fn(step8)
                
                logger.debug(f"Vector search completed, found {len(relevant_chunks)} chunks")
                return result
                
            except Exception as e:
                log_error(logger, e, "Error in search_vector_database function tool")
                return f"Error searching documents: {str(e)}"
        
        @function_tool
        def get_pdfs(project_id: str = None) -> str:
            """
            Get PDF documents for the user's project.
            
            Use this tool when the user:
            - Asks about their PDFs ("show me my PDFs", "what PDFs do I have")
            - Wants to see uploaded documents
            - Asks about specific PDF content or metadata
            - Needs to reference PDFs they've uploaded
            
            Args:
                project_id: Optional project ID to filter PDFs. If not provided, uses project_id from session context.
            
            Returns:
                Formatted string with list of PDF documents and their metadata
            """
            try:
                logger.info(f"[TOOL CALLED] get_pdfs with project_id: {project_id}")
                
                # Get project_id from context if not provided
                project_id_from_context = get_project_id()
                final_project_id = project_id if project_id else project_id_from_context
                
                if not user_id:
                    return "Error: User context not available. Cannot fetch PDFs."
                
                if not final_project_id:
                    return "Error: Project ID not available. Cannot fetch PDFs."
                
                # Emit comprehensive SSE events for PDF fetching
                if user_id:
                    # Step 1: Tool selection
                    step1 = {
                        'type': 'tool_call',
                        'tool_name': 'get_pdfs',
                        'description': 'Deciding to fetch your PDFs...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step1)
                    if collect_step_fn:
                        collect_step_fn(step1)
                    
                    # Step 2: Querying database
                    step2 = {
                        'type': 'tool_call',
                        'tool_name': 'get_pdfs',
                        'description': 'Querying database for PDF documents...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step2)
                    if collect_step_fn:
                        collect_step_fn(step2)
                    
                    # Step 3: Fetching PDFs
                    step3 = {
                        'type': 'tool_call',
                        'tool_name': 'get_pdfs',
                        'description': f'Fetching PDFs for project...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step3)
                    if collect_step_fn:
                        collect_step_fn(step3)
                
                # Import models
                from models.database import PDFDocumentModel, HighlightModel
                
                # Get PDFs for the project
                pdfs = PDFDocumentModel.get_pdf_documents_by_project(user_id, final_project_id)
                
                if not pdfs:
                    if user_id:
                        step4 = {
                            'type': 'tool_call',
                            'tool_name': 'get_pdfs',
                            'description': 'No PDFs found in your project...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                        SSEService.broadcast_to_user(user_id, 'agent_step', step4)
                        if collect_step_fn:
                            collect_step_fn(step4)
                    return "No PDF documents found in your project."
                
                # Emit step: Found PDFs
                if user_id:
                    step4 = {
                        'type': 'tool_call',
                        'tool_name': 'get_pdfs',
                        'description': f'Found {len(pdfs)} PDF document(s)...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step4)
                    if collect_step_fn:
                        collect_step_fn(step4)
                    
                    # Step: Processing PDF metadata
                    step5 = {
                        'type': 'tool_call',
                        'tool_name': 'get_pdfs',
                        'description': 'Processing PDF metadata and highlights...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step5)
                    if collect_step_fn:
                        collect_step_fn(step5)
                
                # Format results
                results = []
                for pdf in pdfs:
                    pdf_id = pdf.get('pdf_id', 'unknown')
                    filename = pdf.get('filename', 'Untitled')
                    extraction_status = pdf.get('extraction_status', 'unknown')
                    file_url = pdf.get('file_url')
                    
                    # Get highlight count
                    highlight_count = 0
                    if file_url:
                        highlight_doc = HighlightModel.get_highlights_by_url(user_id, final_project_id, file_url)
                        if highlight_doc:
                            highlight_count = len(highlight_doc.get('highlights', []))
                    
                    status_emoji = {
                        'completed': '✓',
                        'processing': '⏳',
                        'pending': '⏸',
                        'failed': '✗'
                    }.get(extraction_status, '?')
                    
                    pdf_info = f"- {filename} (ID: {pdf_id})\n  Status: {status_emoji} {extraction_status}\n  Highlights: {highlight_count}"
                    results.append(pdf_info)
                
                # Emit step: Formatting results
                if user_id:
                    step6 = {
                        'type': 'tool_call',
                        'tool_name': 'get_pdfs',
                        'description': 'Formatting PDF list...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step6)
                    if collect_step_fn:
                        collect_step_fn(step6)
                
                result = f"Found {len(pdfs)} PDF document(s) in your project:\n\n" + "\n\n".join(results)
                
                # Emit completion step
                if user_id:
                    step7 = {
                        'type': 'tool_call',
                        'tool_name': 'get_pdfs',
                        'description': 'PDF fetch completed...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step7)
                    if collect_step_fn:
                        collect_step_fn(step7)
                
                logger.debug(f"PDF fetch completed, found {len(pdfs)} PDFs")
                return result
                
            except Exception as e:
                log_error(logger, e, "Error in get_pdfs function tool")
                return f"Error fetching PDFs: {str(e)}"
        
        @function_tool
        def get_highlights(query: str = None, project_id: str = None, source_url: str = None, page_title: str = None) -> str:
            """
            Get highlights for the user's project using semantic search on highlight content and notes.
            
            DEFAULT SEARCH METHOD: Semantic/vector search on highlight text and notes (uses embeddings).
            This searches the actual content of highlights, not just titles or URLs.
            
            Use this tool when the user:
            - Asks about their highlights ("show me my highlights", "what did I highlight about X")
            - Wants to see saved highlights matching a topic or content
            - Asks "what highlights do I have about [topic]" - use query parameter with the topic
            - Mentions highlight content or notes they want to find
            
            ONLY use exact matching (source_url/page_title) if:
            - User explicitly mentions a URL (use source_url)
            - User explicitly mentions "page title" or "title" (use page_title)
            
            Args:
                query: REQUIRED for content search. The search query to find highlights by content/notes using semantic search.
                       This searches highlight text and notes via embeddings. ALWAYS use this when searching by content.
                       Example: if user asks "what highlights do I have about machine learning", use query="machine learning"
                project_id: Optional project ID to filter highlights. If not provided, uses project_id from session context.
                source_url: Optional source URL for exact match filtering (http://, https://, s3://). 
                           ONLY use if user explicitly provides a URL.
                page_title: Optional page title for exact match filtering. 
                           ONLY use if user explicitly mentions "page title" or "title" and provides the exact title.
            
            Returns:
                Formatted string with list of highlights and their metadata
            """
            try:
                logger.info(f"[TOOL CALLED] get_highlights with query: {query}, project_id: {project_id}, source_url: {source_url}, page_title: {page_title}")
                
                # Get project_id from context if not provided
                project_id_from_context = get_project_id()
                final_project_id = project_id if project_id else project_id_from_context
                
                if not user_id:
                    return "Error: User context not available. Cannot fetch highlights."
                
                if not final_project_id:
                    return "Error: Project ID not available. Cannot fetch highlights."
                
                # Emit comprehensive SSE events for highlight fetching
                if user_id:
                    # Step 1: Tool selection
                    step1 = {
                        'type': 'tool_call',
                        'tool_name': 'get_highlights',
                        'description': 'Deciding to fetch your highlights...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step1)
                    if collect_step_fn:
                        collect_step_fn(step1)
                    
                    # Step 2: Determine search method description
                    # Priority: query (semantic) > URL (exact) > page_title (exact) > all
                    if query:
                        step2_desc = f'Searching highlights by content: {query[:100]}{"..." if len(query) > 100 else ""}...'
                    elif source_url and (source_url.startswith('http://') or source_url.startswith('https://') or source_url.startswith('s3://') or source_url.startswith('www.')):
                        step2_desc = 'Searching highlights by URL...'
                    elif page_title:
                        step2_desc = f'Searching highlights by page title: {page_title}...'
                    else:
                        step2_desc = 'Fetching all highlights...'
                    
                    step2 = {
                        'type': 'tool_call',
                        'tool_name': 'get_highlights',
                        'description': step2_desc,
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step2)
                    if collect_step_fn:
                        collect_step_fn(step2)
                    
                    # Step 3: Performing search
                    if query:
                        step3 = {
                            'type': 'tool_call',
                            'tool_name': 'get_highlights',
                            'description': 'Using semantic search on highlight content...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    else:
                        step3 = {
                            'type': 'tool_call',
                            'tool_name': 'get_highlights',
                            'description': 'Querying database...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step3)
                    if collect_step_fn:
                        collect_step_fn(step3)
                
                # Import models
                from models.database import HighlightModel, Database
                
                # Determine search strategy - Priority: query (semantic) > URL (exact) > page_title (exact) > all
                highlights = []
                
                # Check if source_url is actually a URL
                is_url = False
                if source_url:
                    is_url = (
                        source_url.startswith('http://') or 
                        source_url.startswith('https://') or 
                        source_url.startswith('s3://') or
                        source_url.startswith('www.')
                    )
                
                # Priority 1: If query is provided, ALWAYS use semantic/vector search (default method)
                # This searches highlight text and notes via embeddings - takes precedence over page_title and source_url
                if query:
                    search_query = query  # Use provided query for semantic search
                    logger.debug(f"Using semantic search (priority 1): query='{search_query}'")
                    logger.debug(f"Ignoring page_title='{page_title}' and source_url='{source_url}' when query is provided")
                    logger.debug(f"Parameters: user_id={user_id}, project_id={final_project_id}, source_types=['highlight']")
                    
                    # Use vector search to find relevant highlight chunks
                    relevant_chunks = vector_service.search_relevant_chunks(
                        session_id='',  # Not needed for multi-source search
                        query=search_query,
                        top_k=10,
                        user_id=user_id,
                        project_id=final_project_id,
                        source_types=['highlight']  # Only search highlights
                    )
                    
                    logger.debug(f"Vector search returned {len(relevant_chunks)} chunks for query: {search_query}")
                    
                    if relevant_chunks:
                        # Get unique highlight_ids from search results
                        highlight_ids = set()
                        for chunk in relevant_chunks:
                            source_id = chunk.get('source_id')
                            similarity = chunk.get('similarity', 0)
                            chunk_text_preview = chunk.get('chunk_text', '')[:50]
                            if source_id:
                                highlight_ids.add(source_id)
                                logger.debug(f"Found highlight_id: {source_id}, similarity: {similarity:.3f}, chunk_preview: {chunk_text_preview}...")
                        
                        logger.debug(f"Extracted {len(highlight_ids)} unique highlight_ids from search results: {list(highlight_ids)}")
                        
                        # Fetch full highlight documents for the matched highlight_ids
                        if highlight_ids:
                            all_project_highlights = HighlightModel.get_highlights_by_project(
                                user_id=user_id,
                                project_id=final_project_id,
                                limit=None
                            )
                            
                            logger.debug(f"Fetched {len(all_project_highlights)} highlight documents from project")
                            
                            # Match highlights by highlight_id
                            matched_highlight_docs = {}
                            total_highlights_scanned = 0
                            for h_doc in all_project_highlights:
                                for h in h_doc.get('highlights', []):
                                    total_highlights_scanned += 1
                                    highlight_id = h.get('highlight_id')
                                    if highlight_id in highlight_ids:
                                        # Add this highlight document if not already added
                                        source_url_doc = h_doc.get('source_url')
                                        if source_url_doc not in matched_highlight_docs:
                                            matched_highlight_docs[source_url_doc] = {
                                                'source_url': source_url_doc,
                                                'page_title': h_doc.get('page_title'),
                                                'highlights': [],
                                                '_id': h_doc.get('_id'),
                                                'updated_at': h_doc.get('updated_at')
                                            }
                                        # Add the matching highlight
                                        matched_highlight_docs[source_url_doc]['highlights'].append(h)
                                        logger.debug(f"✓ Matched highlight_id: {highlight_id} from source: {source_url_doc}, page_title: {h_doc.get('page_title')}")
                            
                            highlights = list(matched_highlight_docs.values())
                            logger.debug(f"Scanned {total_highlights_scanned} total highlights, matched {len(highlights)} highlight documents with {sum(len(h.get('highlights', [])) for h in highlights)} highlights")
                        else:
                            logger.warning(f"Vector search returned chunks but no highlight_ids found in source_id field")
                            logger.debug(f"Sample chunk structure: {relevant_chunks[0] if relevant_chunks else 'no chunks'}")
                    else:
                        logger.debug(f"No chunks returned from vector search for query: {search_query}")
                        logger.debug(f"This could mean: 1) highlights are not indexed yet, 2) no highlights exist, or 3) query doesn't match any highlight content")
                        
                        # Check if any highlights exist in the database and if they have embeddings (for debugging)
                        try:
                            from models.database import DocumentEmbeddingModel
                            all_project_highlights = HighlightModel.get_highlights_by_project(
                                user_id=user_id,
                                project_id=final_project_id,
                                limit=1
                            )
                            if all_project_highlights:
                                total_highlights = sum(len(h.get('highlights', [])) for h in HighlightModel.get_highlights_by_project(
                                    user_id=user_id,
                                    project_id=final_project_id,
                                    limit=None
                                ))
                                logger.debug(f"Highlights exist in database ({len(all_project_highlights)} sources, {total_highlights} total highlights), but vector search returned no results")
                                
                                # Check if any highlight embeddings exist
                                highlight_embeddings = DocumentEmbeddingModel.get_embeddings_by_filters(
                                    user_id=user_id,
                                    project_id=final_project_id,
                                    source_types=['highlight']
                                )
                                logger.debug(f"Found {len(highlight_embeddings)} highlight embeddings in database")
                                
                                if len(highlight_embeddings) == 0:
                                    logger.warning(f"⚠️ No highlight embeddings found! Highlights may not be indexed yet.")
                                    logger.warning(f"   - Total highlights in database: {total_highlights}")
                                    logger.warning(f"   - Highlights need to be indexed when saved. Check if index_highlight() is being called.")
                                else:
                                    logger.debug(f"Highlights are indexed ({len(highlight_embeddings)} embeddings), but query '{search_query}' doesn't match any highlight content")
                                    # Show sample of what IS indexed
                                    if highlight_embeddings:
                                        sample_chunk = highlight_embeddings[0]
                                        logger.debug(f"Sample indexed chunk preview: {sample_chunk.get('chunk_text', '')[:100]}...")
                            else:
                                logger.debug(f"No highlights found in database for this project")
                        except Exception as check_error:
                            logger.error(f"Error checking highlights in database: {check_error}")
                            import traceback
                            traceback.print_exc()
                    
                    # Ensure highlights is set even if search returned no results
                    if 'highlights' not in locals() or highlights is None:
                        highlights = []
                
                # Priority 2: If source_url is provided and is a URL (and no query), use exact URL match
                elif source_url and is_url:
                    logger.debug(f"Using exact URL match (priority 2): source_url='{source_url}'")
                    highlight_doc = HighlightModel.get_highlights_by_url(
                        user_id=user_id,
                        project_id=final_project_id,
                        source_url=source_url
                    )
                    highlights = [highlight_doc] if highlight_doc else []
                
                # Priority 3: If page_title is explicitly provided (and no query), use exact page_title match
                elif page_title:
                    logger.debug(f"Using exact page_title match (priority 3): page_title='{page_title}'")
                    highlight_doc = HighlightModel.get_highlights_by_page_title(
                        user_id=user_id,
                        project_id=final_project_id,
                        page_title=page_title
                    )
                    highlights = [highlight_doc] if highlight_doc else []
                
                # Priority 4: If no query, source_url, or page_title, return all highlights
                else:
                    logger.debug(f"Fetching all highlights for project (no filters)")
                    highlights = HighlightModel.get_highlights_by_project(
                        user_id=user_id,
                        project_id=final_project_id,
                        limit=None
                    )
                
                if not highlights:
                    if user_id:
                        step4 = {
                            'type': 'tool_call',
                            'tool_name': 'get_highlights',
                            'description': 'No highlights found...',
                            'session_id': session_id,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                        SSEService.broadcast_to_user(user_id, 'agent_step', step4)
                        if collect_step_fn:
                            collect_step_fn(step4)
                    return "No highlights found in your project."
                
                # Emit step: Found highlights
                total_highlight_count = sum(len(h.get('highlights', [])) for h in highlights)
                if user_id:
                    step4 = {
                        'type': 'tool_call',
                        'tool_name': 'get_highlights',
                        'description': f'Found {len(highlights)} source(s) with {total_highlight_count} highlight(s)...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step4)
                    if collect_step_fn:
                        collect_step_fn(step4)
                    
                    # Step: Processing highlights
                    step5 = {
                        'type': 'tool_call',
                        'tool_name': 'get_highlights',
                        'description': 'Processing highlight data...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step5)
                    if collect_step_fn:
                        collect_step_fn(step5)
                
                # Format results
                results = []
                for highlight_doc in highlights:
                    source_url_doc = highlight_doc.get('source_url', 'unknown')
                    page_title = highlight_doc.get('page_title', 'Untitled')
                    highlight_list = highlight_doc.get('highlights', [])
                    
                    source_info = f"Source: {page_title}\nURL: {source_url_doc}\nHighlights ({len(highlight_list)}):"
                    highlight_items = []
                    
                    for i, highlight in enumerate(highlight_list[:10], 1):  # Limit to first 10 per source
                        highlight_text = highlight.get('text', '')[:100]  # Truncate long text
                        if len(highlight.get('text', '')) > 100:
                            highlight_text += '...'
                        note = highlight.get('note')
                        color_tag = highlight.get('color_tag', 'yellow')
                        
                        highlight_item = f"  {i}. [{color_tag}] {highlight_text}"
                        if note:
                            highlight_item += f"\n     Note: {note[:50]}{'...' if len(note) > 50 else ''}"
                        highlight_items.append(highlight_item)
                    
                    if len(highlight_list) > 10:
                        highlight_items.append(f"  ... and {len(highlight_list) - 10} more highlight(s)")
                    
                    results.append(f"{source_info}\n" + "\n".join(highlight_items))
                
                # Emit step: Formatting results
                if user_id:
                    step6 = {
                        'type': 'tool_call',
                        'tool_name': 'get_highlights',
                        'description': 'Formatting highlight list...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step6)
                    if collect_step_fn:
                        collect_step_fn(step6)
                
                result = f"Found {len(highlights)} source(s) with {total_highlight_count} highlight(s):\n\n" + "\n\n".join(results)
                
                # Emit completion step
                if user_id:
                    step7 = {
                        'type': 'tool_call',
                        'tool_name': 'get_highlights',
                        'description': 'Highlight fetch completed...',
                        'session_id': session_id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    SSEService.broadcast_to_user(user_id, 'agent_step', step7)
                    if collect_step_fn:
                        collect_step_fn(step7)
                
                logger.debug(f"Highlight fetch completed, found {len(highlights)} sources with {total_highlight_count} highlights")
                return result
                
            except Exception as e:
                log_error(logger, e, "Error in get_highlights function tool")
                return f"Error fetching highlights: {str(e)}"
        
        # Store tools as instance attributes
        self.perplexity_research_tool = perplexity_research
        self.search_vector_database_tool = search_vector_database
        self.get_pdfs_tool = get_pdfs
        self.get_highlights_tool = get_highlights
    
    async def chat_completion_agentic(
        self,
        messages: List[Dict[str, str]],
        system_message: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,  # For SSE broadcasting
        current_user_message: Optional[str] = None  # Current user message as input (if provided, use instead of extracting from messages)
    ) -> Dict:
        """
        Run the agentic OpenAI service with function tools.
        
        Collects all agent steps (both SSE broadcasts and result object) and returns them.
        """
        """
        Run the agent with messages and return response (async version).
        
        Args:
            messages: List of message dicts (role, content)
            system_message: Optional system message (used as agent instructions)
            session_id: Optional session ID for vector search context
        
        Returns:
            Dict with 'content' field containing the agent's response
        """
        try:
            # Set session_id and project_id in context for function tools
            if session_id:
                set_session_id(session_id)
                # Get project_id from session
                try:
                    from models.database import ChatSessionModel
                    session = ChatSessionModel.get_session(session_id)
                    if session:
                        project_id = session.get('project_id')
                        if project_id:
                            set_project_id(project_id)
                            logger.debug(f"Set project_id in context: {project_id}")
                except Exception as e:
                    logger.debug(f"Could not get project_id from session: {e}")
            
            # Get the current user message as input
            # If current_user_message is provided, use it (conversation history is in system_message)
            # Otherwise, extract from messages array (backward compatibility)
            if current_user_message:
                current_input = current_user_message
                logger.debug(f"Using provided current_user_message as input (length: {len(current_input)})")
            else:
                # Fallback: extract from messages array (for backward compatibility)
                user_messages = [msg for msg in messages if msg.get('role') == 'user']
                if not user_messages:
                    raise ValueError("No user messages found in messages list and current_user_message not provided")
                current_input = user_messages[-1].get('content', '')
                logger.debug(f"Extracted last user message from messages array as input (length: {len(current_input)})")
            
            # Update agent instructions if system message is provided
            # The system message contains mode-specific instructions
            if system_message:
                # Update the agent's instructions with the system message
                # This allows the agent to follow mode-specific behavior (write/research)
                self.agent.instructions = system_message
                logger.debug("Updated agent instructions with system message")
            else:
                # Use base instructions
                self.agent.instructions = self.base_instructions
            
            # Collect all SSE steps that are broadcast during execution
            # This ensures we capture all steps (thinking, tool calls) for persistence
            collected_sse_steps = []
            
            # Helper to collect SSE steps
            def collect_sse_step(step_data):
                """Collect an SSE step for later inclusion in agent_steps"""
                collected_sse_steps.append(step_data.copy())
            
            # Recreate function tools with user_id and session_id for SSE broadcasting
            # This is critical - tools need user_id/session_id to emit SSE events
            # Pass collect_sse_step so tools can also collect their steps
            self._create_function_tools(user_id=user_id, session_id=session_id, collect_step_fn=collect_sse_step)
            # Update agent tools with the new tools that have user_id/session_id
            self.agent.tools = [self.perplexity_research_tool, self.search_vector_database_tool, self.get_pdfs_tool, self.get_highlights_tool]
            
            # Emit initial processing steps via SSE AND collect them
            if user_id:
                step1 = {
                    'type': 'thinking',
                    'description': 'Processing your request...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step1)
                collect_sse_step(step1)
                
                step2 = {
                    'type': 'thinking',
                    'description': 'Analyzing your question...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step2)
                collect_sse_step(step2)
                
                step3 = {
                    'type': 'thinking',
                    'description': 'Determining which tools to use...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step3)
                collect_sse_step(step3)
            
            # Run the agent with the current input (async)
            # Wrap in a task to ensure proper task context for anyio/httpx
            logger.debug(f"Running agent with input (length: {len(current_input)})")
            async def _run_agent_task():
                return await Runner.run(self.agent, input=current_input)
            
            # Create a task explicitly to ensure proper task context
            task = asyncio.create_task(_run_agent_task())
            result = await task
            
            # Emit response generation steps AND collect them
            if user_id:
                step4 = {
                    'type': 'thinking',
                    'description': 'Formatting response...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step4)
                collect_sse_step(step4)
                
                step5 = {
                    'type': 'thinking',
                    'description': 'Preparing final answer...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step5)
                collect_sse_step(step5)
                
                step6 = {
                    'type': 'thinking',
                    'description': 'Generating response with sources...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step6)
                collect_sse_step(step6)
                
                step7 = {
                    'type': 'thinking',
                    'description': 'Structuring response data...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step7)
                collect_sse_step(step7)
                
                step8 = {
                    'type': 'thinking',
                    'description': 'Extracting sources from tool results...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step8)
                collect_sse_step(step8)
                
                step9 = {
                    'type': 'thinking',
                    'description': 'Validating response format...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step9)
                collect_sse_step(step9)
                
                step10 = {
                    'type': 'thinking',
                    'description': 'Ensuring all required fields are present...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step10)
                collect_sse_step(step10)
                
                step11 = {
                    'type': 'thinking',
                    'description': 'Finalizing response...',
                    'session_id': session_id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                SSEService.broadcast_to_user(user_id, 'agent_step', step11)
                collect_sse_step(step11)
            
            # Extract final output
            final_output = result.final_output if hasattr(result, 'final_output') else str(result)
            
            # Extract agent steps (tool calls, thinking, etc.)
            agent_steps = []
            
            def extract_tool_name_and_args(tool_call):
                """Helper to extract tool name and arguments from a tool call object"""
                tool_name = 'unknown'
                tool_args = ''
                
                # Try different ways to access tool call data
                if hasattr(tool_call, 'function'):
                    func = tool_call.function
                    if hasattr(func, 'name'):
                        tool_name = func.name
                    elif isinstance(func, dict):
                        tool_name = func.get('name', 'unknown')
                    
                    if hasattr(func, 'arguments'):
                        tool_args = func.arguments
                    elif isinstance(func, dict):
                        tool_args = func.get('arguments', '')
                elif isinstance(tool_call, dict):
                    func = tool_call.get('function', {})
                    tool_name = func.get('name', 'unknown') if isinstance(func, dict) else 'unknown'
                    tool_args = func.get('arguments', '') if isinstance(func, dict) else ''
                
                return tool_name, tool_args
            
            def create_step_description(tool_name, tool_args):
                """Create a human-readable description for a tool call step"""
                step_description = f"Calling {tool_name}"
                
                if tool_name == 'perplexity_research':
                    # Extract query from arguments if possible
                    try:
                        args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                        query = args_dict.get('query', '') if isinstance(args_dict, dict) else ''
                        if query:
                            step_description = f"Searching Perplexity for: {query[:100]}{'...' if len(query) > 100 else ''}"
                    except:
                        pass
                elif tool_name == 'search_vector_database':
                    try:
                        args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                        query = args_dict.get('query', '') if isinstance(args_dict, dict) else ''
                        if query:
                            step_description = f"Searching your documents for: {query[:100]}{'...' if len(query) > 100 else ''}"
                    except:
                        pass
                elif tool_name == 'get_pdfs':
                    try:
                        args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                        project_id = args_dict.get('project_id', '') if isinstance(args_dict, dict) else ''
                        if project_id:
                            step_description = f"Fetching PDFs for project..."
                        else:
                            step_description = "Fetching your PDFs..."
                    except:
                        step_description = "Fetching your PDFs..."
                elif tool_name == 'get_highlights':
                    try:
                        args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                        source_url = args_dict.get('source_url', '') if isinstance(args_dict, dict) else ''
                        if source_url:
                            step_description = f"Fetching highlights from specific source..."
                        else:
                            step_description = "Fetching your highlights..."
                    except:
                        step_description = "Fetching your highlights..."
                
                return step_description
            
            # Try to extract from raw_responses (RunResult attribute)
            if hasattr(result, 'raw_responses') and result.raw_responses:
                for response in result.raw_responses:
                    # Check if response has messages
                    if hasattr(response, 'messages'):
                        for msg in response.messages:
                            # Check for tool calls
                            tool_calls = None
                            if hasattr(msg, 'tool_calls'):
                                tool_calls = msg.tool_calls
                            elif isinstance(msg, dict):
                                tool_calls = msg.get('tool_calls')
                            
                            if tool_calls:
                                for tool_call in tool_calls:
                                    tool_name, tool_args = extract_tool_name_and_args(tool_call)
                                    step_description = create_step_description(tool_name, tool_args)
                                    
                                    # Avoid duplicates
                                    if not any(step.get('tool_name') == tool_name and step.get('description') == step_description for step in agent_steps):
                                        # Extract args for step data
                                        args_dict = {}
                                        try:
                                            parsed_args = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                                            if isinstance(parsed_args, dict):
                                                args_dict = parsed_args
                                        except:
                                            pass
                                        
                                        # Determine step_id based on tool_name
                                        step_id = (
                                            STEP_ID_SEARCHING_PERPLEXITY if tool_name == 'perplexity_research' 
                                            else STEP_ID_SEARCHING_VECTOR_DB if tool_name == 'search_vector_database'
                                            else f'calling_{tool_name}' if tool_name in ['get_pdfs', 'get_highlights']
                                            else None
                                        )
                                        
                                        agent_steps.append(create_step_data(
                                            step_id=step_id or f'tool_call_{tool_name}',
                                            step_type=STEP_TYPE_TOOL_CALL,
                                            tool_name=tool_name,
                                            args=args_dict,
                                            description=step_description  # Keep description for backward compatibility
                                        ))
            
            # Also check context_wrapper if available
            if hasattr(result, 'context_wrapper') and result.context_wrapper:
                context = result.context_wrapper
                # Check if context has messages or tool calls
                if hasattr(context, 'messages'):
                    for msg in context.messages:
                        if hasattr(msg, 'tool_calls') and msg.tool_calls:
                            for tool_call in msg.tool_calls:
                                tool_name, tool_args = extract_tool_name_and_args(tool_call)
                                step_description = create_step_description(tool_name, tool_args)
                                
                                if not any(step.get('tool_name') == tool_name and step.get('description') == step_description for step in agent_steps):
                                    # Extract args for step data
                                    args_dict = {}
                                    try:
                                        parsed_args = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                                        if isinstance(parsed_args, dict):
                                            args_dict = parsed_args
                                    except:
                                        pass
                                    
                                    # Determine step_id based on tool_name
                                    step_id = (
                                        STEP_ID_SEARCHING_PERPLEXITY if tool_name == 'perplexity_research' 
                                        else STEP_ID_SEARCHING_VECTOR_DB if tool_name == 'search_vector_database'
                                        else f'calling_{tool_name}' if tool_name in ['get_pdfs', 'get_highlights']
                                        else None
                                    )
                                    
                                    agent_steps.append(create_step_data(
                                        step_id=step_id or f'tool_call_{tool_name}',
                                        step_type=STEP_TYPE_TOOL_CALL,
                                        tool_name=tool_name,
                                        args=args_dict,
                                        description=step_description  # Keep description for backward compatibility
                                    ))
            
            # Fallback: Check if result has messages directly
            if hasattr(result, 'messages') and result.messages:
                for msg in result.messages:
                    tool_calls = None
                    if hasattr(msg, 'tool_calls'):
                        tool_calls = msg.tool_calls
                    elif isinstance(msg, dict):
                        tool_calls = msg.get('tool_calls')
                    
                    if tool_calls:
                        for tool_call in tool_calls:
                            tool_name, tool_args = extract_tool_name_and_args(tool_call)
                            step_description = create_step_description(tool_name, tool_args)
                            
                            if not any(step.get('tool_name') == tool_name and step.get('description') == step_description for step in agent_steps):
                                # Extract args for step data
                                args_dict = {}
                                try:
                                    parsed_args = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                                    if isinstance(parsed_args, dict):
                                        args_dict = parsed_args
                                except:
                                    pass
                                
                                # Determine step_id based on tool_name
                                step_id = (
                                    STEP_ID_SEARCHING_PERPLEXITY if tool_name == 'perplexity_research' 
                                    else STEP_ID_SEARCHING_VECTOR_DB if tool_name == 'search_vector_database'
                                    else f'calling_{tool_name}' if tool_name in ['get_pdfs', 'get_highlights']
                                    else None
                                )
                                
                                agent_steps.append(create_step_data(
                                    step_id=step_id or f'tool_call_{tool_name}',
                                    step_type=STEP_TYPE_TOOL_CALL,
                                    tool_name=tool_name,
                                    args=args_dict,
                                    description=step_description  # Keep description for backward compatibility
                                ))
            
            # Merge collected SSE steps with steps extracted from result
            # Remove duplicates based on description and timestamp
            all_steps = collected_sse_steps + agent_steps
            unique_steps = []
            seen = set()
            for step in all_steps:
                # Create a unique key from description and timestamp
                step_key = (step.get('description', ''), step.get('timestamp', ''))
                if step_key not in seen:
                    seen.add(step_key)
                    unique_steps.append(step)
            
            # Sort by timestamp to maintain chronological order
            unique_steps.sort(key=lambda x: x.get('timestamp', ''))
            
            logger.debug(f"Agent returned output (length: {len(final_output)}), total steps: {len(unique_steps)} (SSE: {len(collected_sse_steps)}, Result: {len(agent_steps)})")
            if unique_steps:
                logger.debug(f"Agent steps: {[step.get('description', '')[:50] for step in unique_steps]}")
            else:
                # Log result structure for debugging
                logger.debug(f"Result type: {type(result)}, attributes: {[attr for attr in dir(result) if not attr.startswith('_')]}")
                if hasattr(result, 'messages'):
                    logger.debug(f"Result has messages: {len(result.messages) if result.messages else 0}")
                if hasattr(result, 'turns'):
                    logger.debug(f"Result has turns: {len(result.turns) if result.turns else 0}")
            
            return {
                'content': final_output,
                'function_call': None,  # Function calls are handled internally by the agent
                'citations': [],  # Citations come from Perplexity tool
                'agent_steps': unique_steps  # Agent execution steps for UI display (includes SSE + result steps)
            }
            
        except Exception as e:
            log_error(logger, e, "Error in chat_completion_agentic")
            raise
        finally:
            # Clean up context
            if hasattr(_context, 'session_id'):
                delattr(_context, 'session_id')
    
    def chat_completion_agentic_sync(
        self,
        messages: List[Dict[str, str]],
        system_message: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> Dict:
        """
        Synchronous version using asyncio.run() to create a fresh event loop.
        This ensures proper async context detection by the OpenAI SDK.
        
        Args:
            messages: List of message dicts (role, content)
            system_message: Optional system message
            session_id: Optional session ID for vector search context
        
        Returns:
            Dict with 'content' field
        """
        try:
            # Set session_id and project_id in context for function tools
            if session_id:
                set_session_id(session_id)
                # Get project_id from session
                try:
                    from models.database import ChatSessionModel
                    session = ChatSessionModel.get_session(session_id)
                    if session:
                        project_id = session.get('project_id')
                        if project_id:
                            set_project_id(project_id)
                            logger.debug(f"Set project_id in context: {project_id}")
                except Exception as e:
                    logger.debug(f"Could not get project_id from session: {e}")
            
            # Extract user messages for the agent input
            user_messages = [msg for msg in messages if msg.get('role') == 'user']
            
            if not user_messages:
                raise ValueError("No user messages found in messages list")
            
            # Get the last user message as the current input
            current_input = user_messages[-1].get('content', '')
            
            # Update agent instructions if system message is provided
            if system_message:
                self.agent.instructions = system_message
                logger.debug("Updated agent instructions with system message")
            else:
                self.agent.instructions = self.base_instructions
            
            # Use anyio.from_thread.run() if available, otherwise asyncio.run()
            # anyio.from_thread provides proper task tracking for httpx/httpcore from sync context
            logger.debug(f"Running agent, input (length: {len(current_input)})")
            logger.debug(f"Session ID set in context: {session_id}")
            logger.debug(f"Available tools: perplexity_research, search_vector_database")
            
            async def _run_agent():
                # Wrap in a task to ensure proper task context for anyio
                # This fixes the "cannot create weak reference to NoneType" error
                async def _agent_task():
                    return await Runner.run(self.agent, input=current_input)
                
                # Create a task explicitly so anyio can track it
                task = asyncio.create_task(_agent_task())
                result = await task
                return result
            
            # Use asyncio.run() with nest_asyncio
            # nest_asyncio (applied at module level) allows nested loops
            # Creating a task explicitly ensures proper task context for anyio/httpx/httpcore
            result = asyncio.run(_run_agent())
            
            # Log if any tools were called (check result for tool calls)
            if hasattr(result, 'messages') or hasattr(result, 'turns'):
                logger.debug("Agent execution completed - check tool call logs above for function invocations")
            
            # Extract final output
            final_output = result.final_output if hasattr(result, 'final_output') else str(result)
            
            logger.debug(f"Agent returned output (length: {len(final_output)})")
            
            return {
                'content': final_output,
                'function_call': None,  # Function calls are handled internally by the agent
                'citations': []  # Citations come from Perplexity tool
            }
            
        except Exception as e:
            log_error(logger, e, "Error in chat_completion_agentic_sync")
            raise
        finally:
            # Clean up context
            if hasattr(_context, 'session_id'):
                delattr(_context, 'session_id')

