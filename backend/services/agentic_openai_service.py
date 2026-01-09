"""
Agentic OpenAI Service for Phase 0

This service implements OpenAI Agents SDK with OpenAI as the main agent.
Phase 0: Basic agent setup without tools (for initial testing).
"""

import os
import sys
import json
import asyncio
from typing import List, Dict, Optional

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config import Config
from utils.logger import get_logger, log_error

logger = get_logger(__name__)

try:
    from agents import Agent, Runner
except ImportError:
    logger.error("openai-agents package not installed. Please install it: pip install openai-agents")
    raise


class AgenticOpenAIService:
    """
    Service for using OpenAI Agents SDK with OpenAI as the main agent.
    
    Phase 0: Basic agent without tools (for initial testing).
    """
    
    def __init__(self):
        """Initialize the agentic service."""
        if not Config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        
        # Set OpenAI API key for agents SDK
        os.environ['OPENAI_API_KEY'] = Config.OPENAI_API_KEY
        
        # Model choice: gpt-4o-mini for cost-effectiveness
        self.model = "gpt-4o-mini"
        
        # Base instructions - will be enhanced with system message dynamically
        self.base_instructions = "You are a helpful research assistant. Always respond in valid JSON format with the following structure: {\"message\": \"your response\", \"document_content\": \"\", \"sources\": [], \"new_types\": []}"
        
        # Create basic agent (no tools yet in Phase 0)
        # Instructions will be updated dynamically based on system message
        self.agent = Agent(
            name="Research Assistant",
            instructions=self.base_instructions,
            model=self.model
        )
        
        logger.info("AgenticOpenAIService initialized with OpenAI agent (no tools)")
    
    async def chat_completion_agentic(
        self,
        messages: List[Dict[str, str]],
        system_message: Optional[str] = None
    ) -> Dict:
        """
        Run the agent with messages and return response (async version).
        
        Args:
            messages: List of message dicts (role, content)
            system_message: Optional system message (used as agent instructions)
        
        Returns:
            Dict with 'content' field containing the agent's response
        """
        try:
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
            logger.debug(f"Running agent with input (length: {len(current_input)})")
            result = await Runner.run(self.agent, input=current_input)
            
            # Extract final output
            final_output = result.final_output if hasattr(result, 'final_output') else str(result)
            
            logger.debug(f"Agent returned output (length: {len(final_output)})")
            
            return {
                'content': final_output,
                'function_call': None,  # No function calls in Phase 0
                'citations': []  # No citations in Phase 0
            }
            
        except Exception as e:
            log_error(logger, e, "Error in chat_completion_agentic")
            raise
    
    def chat_completion_agentic_sync(
        self,
        messages: List[Dict[str, str]],
        system_message: Optional[str] = None
    ) -> Dict:
        """
        Synchronous version using asyncio.run() to create a fresh event loop.
        This ensures proper async context detection by the OpenAI SDK.
        
        Args:
            messages: List of message dicts (role, content)
            system_message: Optional system message
        
        Returns:
            Dict with 'content' field
        """
        try:
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
            
            # Use asyncio.run() to create a fresh event loop
            # This ensures proper async context for the OpenAI SDK
            logger.debug(f"Running agent with fresh event loop, input (length: {len(current_input)})")
            
            async def _run_agent():
                result = await Runner.run(self.agent, input=current_input)
                return result
            
            # Create a fresh event loop with asyncio.run()
            # This properly sets up the async context for sniffio detection
            result = asyncio.run(_run_agent())
            
            # Extract final output
            final_output = result.final_output if hasattr(result, 'final_output') else str(result)
            
            logger.debug(f"Agent returned output (length: {len(final_output)})")
            
            return {
                'content': final_output,
                'function_call': None,  # No function calls in Phase 0
                'citations': []  # No citations in Phase 0
            }
            
        except Exception as e:
            log_error(logger, e, "Error in chat_completion_agentic_sync")
            raise

