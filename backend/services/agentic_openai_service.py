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

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config import Config
from utils.logger import get_logger, log_error

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
        self.base_instructions = "You are a helpful research assistant. Always respond in valid JSON format with the following structure: {\"message\": \"your response\", \"document_content\": \"\", \"sources\": [], \"new_types\": []}"
        
        # Create function tools
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
    
    def _create_function_tools(self):
        """Create function tools with proper async handling"""
        
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
                
                # Extract response content
                content = response.choices[0].message.content if response.choices else ""
                
                # Extract citations if available
                citations = []
                if hasattr(response, 'citations') and response.citations:
                    citations = response.citations
                elif hasattr(response, 'citations') and isinstance(response.citations, list):
                    citations = response.citations
                
                # Format response
                result = f"Research Results: {content}"
                if citations:
                    citations_str = "\n".join([f"- {cite}" for cite in citations])
                    result += f"\n\nSources:\n{citations_str}"
                
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
                
                # Get session_id from context
                session_id = get_session_id()
                logger.debug(f"Session ID from context: {session_id}")
                
                if not session_id:
                    logger.warning("Session ID not available in context for vector search")
                    return "Error: Session ID not available. Cannot search documents."
                
                logger.debug(f"Searching vector database with query: {query[:100]}...")
                
                # Search for relevant chunks
                relevant_chunks = vector_service.search_relevant_chunks(session_id, query, top_k=5)
                
                if not relevant_chunks:
                    return "No relevant content found in your documents."
                
                # Format results
                results = []
                for i, chunk in enumerate(relevant_chunks, 1):
                    chunk_text = chunk.get('chunk_text', '')
                    similarity = chunk.get('similarity', 0)
                    results.append(f"[Chunk {i}, Similarity: {similarity:.2f}]\n{chunk_text}")
                
                result = f"Found {len(relevant_chunks)} relevant chunks from your documents:\n\n" + "\n\n---\n\n".join(results)
                
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
        session_id: Optional[str] = None
    ) -> Dict:
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
            
            # Run the agent with the current input (async)
            # Wrap in a task to ensure proper task context for anyio/httpx
            logger.debug(f"Running agent with input (length: {len(current_input)})")
            async def _run_agent_task():
                return await Runner.run(self.agent, input=current_input)
            
            # Create a task explicitly to ensure proper task context
            task = asyncio.create_task(_run_agent_task())
            result = await task
            
            # Extract final output
            final_output = result.final_output if hasattr(result, 'final_output') else str(result)
            
            logger.debug(f"Agent returned output (length: {len(final_output)})")
            
            return {
                'content': final_output,
                'function_call': None,  # Function calls are handled internally by the agent
                'citations': []  # Citations come from Perplexity tool
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

