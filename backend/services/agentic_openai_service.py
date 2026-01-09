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


# Store session_id in a thread-local or context for function tools
import threading
_context = threading.local()

def get_session_id():
    """Get current session_id from context"""
    return getattr(_context, 'session_id', None)

def set_session_id(session_id):
    """Set current session_id in context"""
    _context.session_id = session_id


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
            tools=[self.perplexity_research_tool, self.search_vector_database_tool]
        )
        
        logger.info("AgenticOpenAIService initialized with OpenAI agent (Chat Completions API) and function tools (perplexity_research, search_vector_database)")
    
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
        def search_vector_database(query: str) -> str:
            """
            Search the user's saved documents, highlights, and content using semantic search.
            
            ALWAYS use this tool when the user:
            - Asks to summarize their document ("summarize my document", "summarize the document")
            - Asks about their documents ("what did I write about X", "what's in my document")
            - Mentions "my document", "the document", "my saved content", "my highlights"
            - Asks to find information from their saved content
            - Wants to know what they've written or saved
            
            This tool searches through the user's actual saved documents and content.
            If the user asks about THEIR document or content, you MUST call this tool first.
            
            Args:
                query: The search query to find relevant content (use the user's question or topic)
            
            Returns:
                Formatted string with relevant document chunks from the user's documents
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
                
                # Get session_id from context
                session_id_from_context = get_session_id()
                logger.debug(f"Session ID from context: {session_id_from_context}")
            
                # Use session_id from parameter if available, otherwise from context
                search_session_id = session_id if session_id else session_id_from_context
                if not search_session_id:
                    logger.warning("Session ID not available in context for vector search")
                    return "Error: Session ID not available. Cannot search documents."
                
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
                
                # Search for relevant chunks
                relevant_chunks = vector_service.search_relevant_chunks(search_session_id, query, top_k=5)
                
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
                
                # Format results
                results = []
                for i, chunk in enumerate(relevant_chunks, 1):
                    chunk_text = chunk.get('chunk_text', '')
                    similarity = chunk.get('similarity', 0)
                    results.append(f"[Chunk {i}, Similarity: {similarity:.2f}]\n{chunk_text}")
                
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
        
        # Store tools as instance attributes
        self.perplexity_research_tool = perplexity_research
        self.search_vector_database_tool = search_vector_database
    
    async def chat_completion_agentic(
        self,
        messages: List[Dict[str, str]],
        system_message: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None  # For SSE broadcasting
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
            # Set session_id in context for function tools
            if session_id:
                set_session_id(session_id)
            
            # Extract user messages for the agent input
            user_messages = [msg for msg in messages if msg.get('role') == 'user']
            
            if not user_messages:
                raise ValueError("No user messages found in messages list")
            
            # Get the last user message as the current input
            # For Phase 0, we use the last user message
            # In future phases, we'll use sessions for full conversation history
            current_input = user_messages[-1].get('content', '')
            
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
            self.agent.tools = [self.perplexity_research_tool, self.search_vector_database_tool]
            
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
                                        # Extract query from args for step data
                                        try:
                                            args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                                            query = args_dict.get('query', '') if isinstance(args_dict, dict) else ''
                                        except:
                                            query = ''
                                        
                                        # Determine step_id based on tool_name
                                        step_id = STEP_ID_SEARCHING_PERPLEXITY if tool_name == 'perplexity_research' else STEP_ID_SEARCHING_VECTOR_DB if tool_name == 'search_vector_database' else None
                                        
                                        agent_steps.append(create_step_data(
                                            step_id=step_id or f'tool_call_{tool_name}',
                                            step_type=STEP_TYPE_TOOL_CALL,
                                            tool_name=tool_name,
                                            args={'query': query} if query else {},
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
                                    # Extract query from args for step data
                                    try:
                                        args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                                        query = args_dict.get('query', '') if isinstance(args_dict, dict) else ''
                                    except:
                                        query = ''
                                    
                                    # Determine step_id based on tool_name
                                    step_id = STEP_ID_SEARCHING_PERPLEXITY if tool_name == 'perplexity_research' else STEP_ID_SEARCHING_VECTOR_DB if tool_name == 'search_vector_database' else None
                                    
                                    agent_steps.append(create_step_data(
                                        step_id=step_id or f'tool_call_{tool_name}',
                                        step_type=STEP_TYPE_TOOL_CALL,
                                        tool_name=tool_name,
                                        args={'query': query} if query else {},
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
                                # Extract query from args for step data
                                try:
                                    args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                                    query = args_dict.get('query', '') if isinstance(args_dict, dict) else ''
                                except:
                                    query = ''
                                
                                # Determine step_id based on tool_name
                                step_id = STEP_ID_SEARCHING_PERPLEXITY if tool_name == 'perplexity_research' else STEP_ID_SEARCHING_VECTOR_DB if tool_name == 'search_vector_database' else None
                                
                                agent_steps.append(create_step_data(
                                    step_id=step_id or f'tool_call_{tool_name}',
                                    step_type=STEP_TYPE_TOOL_CALL,
                                    tool_name=tool_name,
                                    args={'query': query} if query else {},
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
            # Set session_id in context for function tools
            if session_id:
                set_session_id(session_id)
            
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

