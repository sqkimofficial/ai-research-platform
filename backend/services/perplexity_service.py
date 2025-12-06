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
                    "document_structure": {
                        "type": "array",
                        "description": "Array of structured document elements",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "type": {"type": "string"},
                                "content": {"type": "string"},
                                "parent_id": {"type": ["string", "null"]},
                                "metadata": {"type": "object"}
                            },
                            "required": ["id", "type", "content"]
                        }
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
                "required": ["message", "document_content", "document_structure", "sources", "new_types"]
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
            print(f"Perplexity API error: {e}")
            raise
    
    def parse_json_response(self, response_text):
        """
        Parse JSON response from AI with fuzzy/robust handling.
        Handles common JSON formatting issues like unescaped newlines, control characters, etc.
        Returns dict with 'message', 'document_content', 'document_structure', 'sources' keys.
        
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
                    'document_structure': [],
                    'placement': None,
                    'sources': [],
                    'new_types': []
                }
            
            json_str = json_match.group(0)
            
            # Step 2: Try standard JSON parsing first
            try:
                parsed = json.loads(json_str)
                # Handle both Stage 1 (document_content) and Stage 2 (updated_document_content) responses
                return {
                    'message': parsed.get('message', ''),
                    'document_content': parsed.get('document_content', '') or parsed.get('updated_document_content', ''),
                    'updated_document_content': parsed.get('updated_document_content', ''),
                    'document_structure': parsed.get('document_structure', []) or parsed.get('updated_document_structure', []),
                    'updated_document_structure': parsed.get('updated_document_structure', []),
                    'placement': parsed.get('placement'),
                    'placement_applied': parsed.get('placement_applied', ''),
                    'placement_explanation': parsed.get('placement_explanation', ''),
                    'sources': parsed.get('sources', []),
                    'new_types': parsed.get('new_types', [])
                }
            except json.JSONDecodeError as e:
                # Step 3: Fuzzy parsing - fix common JSON issues
                print(f"Warning: JSON parsing failed, attempting fuzzy parsing: {e}")
                
                # Fix unescaped newlines and control characters in string values
                fixed_json = self._fix_json_strings(json_str)
                
                # Try parsing the fixed JSON
                try:
                    parsed = json.loads(fixed_json)
                    # Handle both Stage 1 and Stage 2 responses
                    return {
                        'message': parsed.get('message', ''),
                        'document_content': parsed.get('document_content', '') or parsed.get('updated_document_content', ''),
                        'updated_document_content': parsed.get('updated_document_content', ''),
                        'document_structure': parsed.get('document_structure', []) or parsed.get('updated_document_structure', []),
                        'updated_document_structure': parsed.get('updated_document_structure', []),
                        'placement': parsed.get('placement'),
                        'placement_applied': parsed.get('placement_applied', ''),
                        'placement_explanation': parsed.get('placement_explanation', ''),
                        'sources': parsed.get('sources', []),
                        'new_types': parsed.get('new_types', [])
                    }
                except json.JSONDecodeError:
                    # Step 4: Last resort - extract values using regex
                    return self._extract_json_values_fuzzy(json_str)
                    
        except Exception as e:
            # Final fallback - treat entire response as message
            print(f"Warning: Failed to parse JSON response: {e}")
            print(f"Response was: {response_text[:500]}...")
            return {
                'message': response_text,
                'document_content': '',
                'document_structure': [],
                'placement': None,
                'sources': [],
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
        # Try to extract message field (handles multiline)
        message_patterns = [
            r'"message"\s*:\s*"((?:[^"\\]|\\.)*)"',  # Standard quoted string
            r'"message"\s*:\s*"([^"]*)"',  # Simple quoted string
            r'"message"\s*:\s*"([\s\S]*?)"(?=\s*[,}])',  # Multiline string
        ]
        
        message = ''
        for pattern in message_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                message = match.group(1)
                # Decode escaped characters
                message = message.replace('\\n', '\n').replace('\\r', '\r').replace('\\t', '\t')
                message = message.replace('\\"', '"').replace('\\\\', '\\')
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
        
        # Try to extract document_structure array
        doc_structure = []
        structure_patterns = [
            r'"document_structure"\s*:\s*\[(.*?)\]',
            r'"document_structure"\s*:\s*\[\s*\]',
        ]
        
        for pattern in structure_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                if match.group(0).strip() == '[]':
                    doc_structure = []
                else:
                    structure_str = match.group(1)
                    try:
                        doc_structure = json.loads(f'[{structure_str}]')
                    except:
                        doc_structure = []
                break
        
        # Try to extract placement object
        placement = None
        placement_patterns = [
            r'"placement"\s*:\s*(\{[^}]*\})',
            r'"placement"\s*:\s*null',
        ]
        
        for pattern in placement_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                if 'null' in match.group(0):
                    placement = None
                else:
                    try:
                        placement = json.loads(match.group(1))
                    except:
                        placement = None
                break
        
        # Try to extract placement_applied and placement_explanation
        placement_applied = ''
        placement_explanation = ''
        
        placement_applied_patterns = [
            r'"placement_applied"\s*:\s*"((?:[^"\\]|\\.)*)"',
            r'"placement_applied"\s*:\s*"([^"]*)"',
        ]
        for pattern in placement_applied_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                placement_applied = match.group(1)
                placement_applied = placement_applied.replace('\\n', '\n').replace('\\r', '\r').replace('\\t', '\t')
                placement_applied = placement_applied.replace('\\"', '"').replace('\\\\', '\\')
                break
        
        placement_explanation_patterns = [
            r'"placement_explanation"\s*:\s*"((?:[^"\\]|\\.)*)"',
            r'"placement_explanation"\s*:\s*"([^"]*)"',
        ]
        for pattern in placement_explanation_patterns:
            match = re.search(pattern, json_str, re.DOTALL)
            if match:
                placement_explanation = match.group(1)
                placement_explanation = placement_explanation.replace('\\n', '\n').replace('\\r', '\r').replace('\\t', '\t')
                placement_explanation = placement_explanation.replace('\\"', '"').replace('\\\\', '\\')
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
        
        return {
            'message': message,
            'document_content': doc_content,
            'document_structure': doc_structure if isinstance(doc_structure, list) else [],
            'placement': placement,
            'placement_applied': placement_applied,
            'placement_explanation': placement_explanation,
            'sources': sources if isinstance(sources, list) else [],
            'new_types': new_types if isinstance(new_types, list) else []
        }

