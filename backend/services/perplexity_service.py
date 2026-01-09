"""
Perplexity Service for Stage 1 AI (Content Generation)

This service integrates Perplexity API for the chat/content generation phase.
Perplexity provides grounded LLM responses with web search capabilities,
which is ideal for research assistance.
"""

import os
import sys
import json
import re

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config import Config
from utils.logger import get_logger, log_error

logger = get_logger(__name__)


class PerplexityService:
    """
    Service for interacting with Perplexity API.
    Uses the official perplexityai SDK for chat completions.
    
    Perplexity provides:
    - Grounded responses with real-time web search
    - Citations for sources
    - OpenAI-compatible chat completions format
    """
    
    def __init__(self):
        """Initialize Perplexity client with API key from config."""
        self.api_key = Config.PERPLEXITY_API_KEY
        
        if not self.api_key:
            raise ValueError("PERPLEXITY_API_KEY not found in environment variables")
        
        # Import and initialize the Perplexity client
        try:
            from perplexity import Perplexity
            self.client = Perplexity(api_key=self.api_key)
            self._use_native_client = True
        except ImportError:
            # Fallback to OpenAI-compatible endpoint
            from openai import OpenAI
            self.client = OpenAI(
                api_key=self.api_key,
                base_url="https://api.perplexity.ai"
            )
            self._use_native_client = False
        
        # Default model: sonar-pro for research-quality responses
        # Other options: sonar (faster, cheaper), sonar-pro (more capable)
        self.model = "sonar-pro"
    
    def chat_completion(self, messages, temperature=0.7, functions=None, function_call="auto"):
        """
        Generate a chat completion using Perplexity API with structured JSON output.
        
        Uses Perplexity's response_format with JSON Schema to enforce
        consistent output format every time.
        
        Args:
            messages: List of message dicts (role, content)
            temperature: Sampling temperature (0-1)
            functions: Ignored - Perplexity doesn't support function calling
            function_call: Ignored - Perplexity doesn't support function calling
        
        Returns:
            Response dict with 'content' and optional 'citations'
        """
        try:
            # Define the JSON schema for structured output
            # This enforces Perplexity to ALWAYS return this exact format
            response_schema = {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Conversational response to the user"
                    },
                    "document_content": {
                        "type": "string",
                        "description": "Markdown content to add to the document, or empty string if no document update"
                    },
                    "sources": {
                        "type": "array",
                        "description": "Array of source URLs or citations",
                        "items": {"type": "string"}
                    },
                    "new_types": {
                        "type": "array",
                        "description": "Array of new document types to create",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type_name": {"type": "string"},
                                "description": {"type": "string"},
                                "metadata_schema": {"type": "object"}
                            },
                            "required": ["type_name", "description"]
                        }
                    }
                },
                "required": ["message", "document_content", "sources", "new_types"]
            }
            
            # Make the API call with structured output enforcement
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "schema": response_schema
                    }
                }
            )
            
            # Extract the response content
            content = completion.choices[0].message.content if completion.choices else ''
            
            # Extract citations if available (Perplexity specific)
            citations = []
            if hasattr(completion, 'citations') and completion.citations:
                citations = completion.citations
            
            return {
                'content': content,
                'function_call': None,  # Perplexity doesn't support function calling
                'citations': citations   # Perplexity provides web citations
            }
            
        except Exception as e:
            log_error(logger, e, "Perplexity API error")
            raise
    
    def parse_json_response(self, response_text):
        """
        Parse JSON response from AI with fuzzy/robust handling.
        Handles common JSON formatting issues like unescaped newlines, control characters, etc.
        Returns dict with 'message', 'document_content', 'sources', 'new_types' keys.
        
        This method mirrors OpenAIService.parse_json_response() for compatibility.
        """
        try:
            # Step 1: Try to extract JSON block from response (in case there's extra text)
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if not json_match:
                # No JSON found, treat entire response as message
                return {
                    'message': response_text,
                    'document_content': '',
                    'sources': [],
                    'new_types': []
                }
            
            json_str = json_match.group(0)
            
            # Step 2: Try standard JSON parsing first
            try:
                parsed = json.loads(json_str)
                # Ensure message is never empty if we have sources or document_content
                message = parsed.get('message', '')
                if not message and (parsed.get('sources') or parsed.get('document_content')):
                    # Fallback: use document_content or sources as message if message is missing
                    message = parsed.get('document_content', '') or 'Response generated successfully.'
                
                return {
                    'message': message,
                    'document_content': parsed.get('document_content', '') or parsed.get('updated_document_content', ''),
                    'sources': parsed.get('sources', []),
                    'new_types': parsed.get('new_types', [])
                }
            except json.JSONDecodeError as e:
                # Step 3: Fuzzy parsing - fix common JSON issues
                logger.warning(f"JSON parsing failed, attempting fuzzy parsing: {e}")
                
                # Fix unescaped newlines and control characters in string values
                fixed_json = self._fix_json_strings(json_str)
                
                # Try parsing the fixed JSON
                try:
                    parsed = json.loads(fixed_json)
                    # Ensure message is never empty if we have sources or document_content
                    message = parsed.get('message', '')
                    if not message and (parsed.get('sources') or parsed.get('document_content')):
                        # Fallback: use document_content or sources as message if message is missing
                        message = parsed.get('document_content', '') or 'Response generated successfully.'
                    
                    return {
                        'message': message,
                        'document_content': parsed.get('document_content', '') or parsed.get('updated_document_content', ''),
                        'sources': parsed.get('sources', []),
                        'new_types': parsed.get('new_types', [])
                    }
                except json.JSONDecodeError:
                    # Step 4: Last resort - extract values using regex
                    return self._extract_json_values_fuzzy(json_str)
                    
        except Exception as e:
            # Final fallback - try to extract at least sources and message from the raw text
            logger.warning(f"Failed to parse JSON response: {e}")
            logger.debug(f"Response was: {response_text[:500]}...")
            
            # Try to extract sources from the text even if JSON parsing failed
            sources = []
            url_pattern = r'https?://[^\s,\]]+'
            found_urls = re.findall(url_pattern, response_text)
            if found_urls:
                sources = list(set(found_urls))
            
            # Use the response text as message, or a default if empty
            message = response_text.strip() or 'Response received but could not be parsed.'
            
            return {
                'message': message,
                'document_content': '',
                'sources': sources,
                'new_types': []
            }
    
    def _fix_json_strings(self, json_str):
        """Fix unescaped newlines and control characters in JSON string values."""
        result = []
        i = 0
        in_string = False
        escape_next = False
        
        while i < len(json_str):
            char = json_str[i]
            
            if escape_next:
                result.append(char)
                escape_next = False
            elif char == '\\':
                result.append(char)
                escape_next = True
            elif char == '"' and not escape_next:
                in_string = not in_string
                result.append(char)
            elif in_string:
                # We're inside a string value - escape control characters
                if char == '\n':
                    result.append('\\n')
                elif char == '\r':
                    result.append('\\r')
                elif char == '\t':
                    result.append('\\t')
                elif ord(char) < 32:  # Other control characters
                    result.append(f'\\u{ord(char):04x}')
                else:
                    result.append(char)
            else:
                result.append(char)
            
            i += 1
        
        return ''.join(result)
    
    def _extract_json_values_fuzzy(self, json_str):
        """Extract JSON values using regex as last resort."""
        # Try to extract message field (handles multiline and escaped characters)
        message_patterns = [
            r'"message"\s*:\s*"((?:[^"\\]|\\.)*)"',  # Standard quoted string with escapes
            r'"message"\s*:\s*"([\s\S]*?)"(?=\s*[,}])',  # Multiline string (non-greedy)
            r'"message"\s*:\s*"([^"]*)"',  # Simple quoted string (fallback)
            r'"message"\s*:\s*"([\s\S]*)"',  # Very greedy multiline (last resort)
        ]
        
        message = ''
        for pattern in message_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                message = match.group(1)
                # Decode escaped characters
                message = message.replace('\\n', '\n').replace('\\r', '\r').replace('\\t', '\t')
                message = message.replace('\\"', '"').replace('\\\\', '\\')
                # Remove any trailing content that might have been captured incorrectly
                if message:
                    break
        
        # Try to extract document_content field
        doc_patterns = [
            r'"document_content"\s*:\s*"((?:[^"\\]|\\.)*)"',
            r'"document_content"\s*:\s*"([^"]*)"',
            r'"document_content"\s*:\s*"([\s\S]*?)"(?=\s*[,}])',
        ]
        
        doc_content = ''
        for pattern in doc_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                doc_content = match.group(1)
                # Decode escaped characters
                doc_content = doc_content.replace('\\n', '\n').replace('\\r', '\r').replace('\\t', '\t')
                doc_content = doc_content.replace('\\"', '"').replace('\\\\', '\\')
                break
        
        # Try to extract sources array
        sources = []
        sources_patterns = [
            r'"sources"\s*:\s*\[(.*?)\]',  # Array with content
            r'"sources"\s*:\s*\[\s*\]',  # Empty array
        ]
        
        for pattern in sources_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                if match.group(0).strip() == '[]':
                    sources = []
                else:
                    sources_str = match.group(1)
                    # Try to parse as JSON array
                    try:
                        sources = json.loads(f'[{sources_str}]')
                    except:
                        # Extract URLs manually
                        url_pattern = r'https?://[^\s,\]]+'
                        sources = re.findall(url_pattern, sources_str)
                        # Also try to find quoted strings
                        quoted_pattern = r'"([^"]+)"'
                        quoted_sources = re.findall(quoted_pattern, sources_str)
                        if quoted_sources:
                            sources = list(set(sources + quoted_sources))
                break
        
        # Try to extract new_types array
        new_types = []
        new_types_patterns = [
            r'"new_types"\s*:\s*\[(.*?)\]',
            r'"new_types"\s*:\s*\[\s*\]',
        ]
        
        for pattern in new_types_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                if match.group(0).strip() == '[]':
                    new_types = []
                else:
                    types_str = match.group(1)
                    try:
                        new_types = json.loads(f'[{types_str}]')
                    except:
                        new_types = []
                break
        
        # Ensure message is never empty if we have sources or document_content
        if not message and (sources or doc_content):
            # Fallback: use document_content or a default message
            message = doc_content or 'Response generated successfully.'
        
        return {
            'message': message,
            'document_content': doc_content,
            'sources': sources if isinstance(sources, list) else [],
            'new_types': new_types if isinstance(new_types, list) else []
        }



