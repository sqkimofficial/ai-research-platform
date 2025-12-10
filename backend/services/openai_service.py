from openai import OpenAI
import os
import sys
import json
import re
# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
from config import Config

class OpenAIService:
    def __init__(self):
        self.client = OpenAI(api_key=Config.OPENAI_API_KEY)
        self.model = "gpt-4.1-nano"
    
    def chat_completion(self, messages, temperature=0.7, functions=None, function_call="auto"):
        """
        Generate a chat completion using OpenAI API with optional function calling support.
        
        Args:
            messages: List of message dicts
            temperature: Sampling temperature
            functions: Optional list of function definitions for function calling
            function_call: "auto", "none", or specific function name
        
        Returns:
            Response object with content and optional function_call
        """
        try:
            params = {
                'model': self.model,
                'messages': messages,
            }
            
            if functions:
                params['functions'] = functions
                params['function_call'] = function_call
            
            response = self.client.chat.completions.create(**params)
            
            message = response.choices[0].message
            
            # Return both content and function_call if present
            # content can be None when function_call is present
            content = message.content if message.content else ''
            function_call = None
            if hasattr(message, 'function_call') and message.function_call:
                function_call = message.function_call
            
            return {
                'content': content,
                'function_call': function_call
            }
        except Exception as e:
            print(f"OpenAI API error: {e}")
            raise
    
    def parse_json_response(self, response_text):
        """
        Parse JSON response from AI with fuzzy/robust handling.
        Handles common JSON formatting issues like unescaped newlines, control characters, etc.
        Returns dict with 'message', 'document_content', and 'sources' keys.
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
                    'sources': []
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
                    'sources': parsed.get('sources', [])
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
                        'sources': parsed.get('sources', [])
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
                'sources': []
            }
    
    def _fix_json_strings(self, json_str):
        """Fix unescaped newlines and control characters in JSON string values."""
        result = []
        i = 0
        in_string = False
        escape_next = False
        in_key = False
        
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
        
        return {
            'message': message,
            'document_content': doc_content,
            'document_structure': doc_structure if isinstance(doc_structure, list) else [],
            'placement': placement,
            'placement_applied': placement_applied,
            'placement_explanation': placement_explanation,
            'sources': sources if isinstance(sources, list) else []
        }
    
    def create_embedding(self, text, model="text-embedding-3-small"):
        """Create an embedding for text"""
        try:
            response = self.client.embeddings.create(
                model=model,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"OpenAI Embedding API error: {e}")
            raise

