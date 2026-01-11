"""
Memory Management Service for Chat Session Compression

This service handles token counting and summarization logic for chat sessions.
Implements memory compression strategy to manage long conversation histories.
"""

import os
import sys
import json
import re
from typing import List, Dict, Optional, Tuple

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

try:
    import tiktoken
except ImportError:
    raise ImportError(
        "tiktoken is required for token counting. Install it with: pip install tiktoken>=0.5.0"
    )

from openai import OpenAI
from config import Config
from utils.logger import get_logger, log_error
from datetime import datetime

logger = get_logger(__name__)

# Token threshold for summarization
TOKEN_THRESHOLD = 3000  # Summarize when total tokens exceed this
KEEP_WINDOW_MAX_TOKENS = 2500  # Keep last N messages fitting in this token limit

# GPT-4o-mini uses cl100k_base encoding
# This is the same encoding used by GPT-4, GPT-4 Turbo, and GPT-3.5
_ENCODING_NAME = "cl100k_base"
_encoding = None


def _get_encoding():
    """Get or initialize the tiktoken encoding for GPT-4o-mini."""
    global _encoding
    if _encoding is None:
        try:
            _encoding = tiktoken.get_encoding(_ENCODING_NAME)
            logger.debug(f"Initialized tiktoken encoding: {_ENCODING_NAME}")
        except Exception as e:
            log_error(logger, e, f"Failed to initialize tiktoken encoding: {_ENCODING_NAME}")
            raise
    return _encoding


def count_tokens(text: str) -> int:
    """
    Count the number of tokens in a text string using GPT-4o-mini's encoding.
    
    Args:
        text: The text string to count tokens for
        
    Returns:
        int: Number of tokens in the text
        
    Example:
        >>> count_tokens("Hello, world!")
        4
    """
    if not text:
        return 0
    
    try:
        encoding = _get_encoding()
        tokens = encoding.encode(text)
        return len(tokens)
    except Exception as e:
        log_error(logger, e, f"Error counting tokens for text: {text[:100]}...")
        # Fallback: approximate calculation (~4 chars = 1 token)
        return len(text) // 4


def count_tokens_for_message(message: Dict) -> int:
    """
    Count tokens for a single message (role + content).
    
    OpenAI message format includes:
    - Role name (e.g., "user", "assistant", "system")
    - Content text
    
    Approximate overhead per message: ~4 tokens for formatting
    
    Args:
        message: Message dict with 'role' and 'content' keys
        
    Returns:
        int: Number of tokens in the message
        
    Example:
        >>> message = {"role": "user", "content": "Hello"}
        >>> count_tokens_for_message(message)
        7  # ~4 tokens for role/formatting + 3 tokens for "Hello"
    """
    if not message:
        return 0
    
    role = message.get('role', '')
    content = message.get('content', '')
    
    if not content:
        return 4  # Minimum overhead for empty message
    
    # Count tokens for role and content
    # Role adds ~1-2 tokens, formatting adds ~2-3 tokens
    role_tokens = count_tokens(role)
    content_tokens = count_tokens(str(content))
    
    # Add overhead for message formatting (~4 tokens)
    # This accounts for JSON structure, role tags, etc.
    formatting_overhead = 4
    
    total = role_tokens + content_tokens + formatting_overhead
    
    # Handle special fields that might add tokens
    if 'sources' in message and message['sources']:
        sources_text = ' '.join(str(s) for s in message['sources'])
        total += count_tokens(sources_text)
    
    if 'document_content' in message and message.get('document_content'):
        doc_content = str(message['document_content'])
        total += count_tokens(doc_content)
    
    return total


def count_tokens_for_messages(messages: List[Dict]) -> int:
    """
    Count total tokens for a list of messages.
    
    Args:
        messages: List of message dicts with 'role' and 'content' keys
        
    Returns:
        int: Total number of tokens across all messages
        
    Example:
        >>> messages = [
        ...     {"role": "user", "content": "Hello"},
        ...     {"role": "assistant", "content": "Hi there!"}
        ... ]
        >>> count_tokens_for_messages(messages)
        15  # Approximate count
    """
    if not messages:
        return 0
    
    total = 0
    for message in messages:
        total += count_tokens_for_message(message)
    
    return total


def count_tokens_for_system_prompt(system_prompt: str) -> int:
    """
    Count tokens for a system prompt.
    
    Args:
        system_prompt: The system prompt text
        
    Returns:
        int: Number of tokens in the system prompt
    """
    if not system_prompt:
        return 0
    
    # System prompt has minimal overhead (~2 tokens for role)
    return count_tokens(system_prompt) + 2


def count_tokens_for_summary(summary: str) -> int:
    """
    Count tokens for a conversation summary text.
    
    Args:
        summary: The summary text
        
    Returns:
        int: Number of tokens in the summary
    """
    if not summary:
        return 0
    
    return count_tokens(summary)


def count_tokens_for_important_data(important_data: Dict) -> int:
    """
    Count tokens for structured important data.
    
    Important data is typically serialized as JSON when added to prompt.
    This estimates the token count for the JSON representation.
    
    Args:
        important_data: Dict with important data fields
        
    Returns:
        int: Estimated number of tokens when serialized to JSON
    """
    if not important_data:
        return 0
    
    # Serialize to JSON string and count tokens
    try:
        json_str = json.dumps(important_data, indent=0)
        # Add overhead for formatting in prompt (~10 tokens)
        return count_tokens(json_str) + 10
    except Exception as e:
        log_error(logger, e, "Error serializing important_data for token counting")
        # Fallback: approximate calculation
        data_str = str(important_data)
        return count_tokens(data_str) + 10


def estimate_total_tokens(
    system_prompt: str,
    messages: List[Dict],
    conversation_summary: Optional[str] = None,
    important_data: Optional[Dict] = None
) -> int:
    """
    Estimate total tokens for a complete prompt including system, messages, summaries.
    
    This is used to determine if summarization is needed before constructing the full prompt.
    
    Args:
        system_prompt: System prompt text
        messages: List of message dicts
        conversation_summary: Optional conversation summary text
        important_data: Optional important data dict
        
    Returns:
        int: Estimated total tokens for the complete prompt
        
    Example:
        >>> system = "You are a helpful assistant."
        >>> messages = [{"role": "user", "content": "Hello"}]
        >>> estimate_total_tokens(system, messages)
        20  # Approximate count
    """
    total = 0
    
    # System prompt
    if system_prompt:
        total += count_tokens_for_system_prompt(system_prompt)
    
    # Messages
    if messages:
        total += count_tokens_for_messages(messages)
    
    # Conversation summary (if exists)
    if conversation_summary:
        # Add overhead for summary section header (~5 tokens)
        total += count_tokens_for_summary(conversation_summary) + 5
    
    # Important data (if exists)
    if important_data:
        # Add overhead for important data section header (~5 tokens)
        total += count_tokens_for_important_data(important_data) + 5
    
    return total


# ============================================================================
# Phase 3: Token Threshold Detection and Message Window Logic
# ============================================================================

def should_summarize(
    messages: List[Dict],
    threshold: int = TOKEN_THRESHOLD
) -> bool:
    """
    Determine if summarization is needed based on message token count only.
    
    Only counts tokens from messages (user + assistant conversations).
    System prompt, summaries, and important_data are constant overhead and not
    part of the summarization decision - they're always sent regardless.
    
    Args:
        messages: List of message dicts (user + assistant conversations)
        threshold: Token threshold (default: 3000)
        
    Returns:
        bool: True if message tokens exceed threshold, False otherwise
        
    Example:
        >>> messages = [{"role": "user", "content": "Hello"}]
        >>> should_summarize(messages)
        False  # Short conversation, no summarization needed
    """
    if not messages:
        return False
    
    # Only count tokens from messages - not system_prompt, summary, or important_data
    # These are constant overhead and don't affect summarization decisions
    total_tokens = count_tokens_for_messages(messages)
    
    should = total_tokens > threshold
    logger.debug(
        f"Message token count: {total_tokens}, threshold: {threshold}, "
        f"should_summarize: {should} (only messages counted, system_prompt/summary/important_data excluded)"
    )
    
    return should


def determine_keep_window(
    messages: List[Dict],
    system_prompt: str,
    conversation_summary: Optional[str] = None,
    important_data: Optional[Dict] = None,
    max_tokens: int = KEEP_WINDOW_MAX_TOKENS
) -> Tuple[List[Dict], List[int]]:
    """
    Determine which messages to keep (last N messages that fit in token limit).
    
    This function finds the last N messages that fit within the max_tokens limit,
    working backwards from the end of the messages array.
    
    System prompt, summary, and important_data are used ONLY as overhead when
    calculating available tokens for messages. They are not part of summarization
    - they're constant overhead that's always sent with the prompt.
    
    Args:
        messages: List of all message dicts
        system_prompt: System prompt text (used as overhead, not summarized)
        conversation_summary: Optional existing conversation summary (used as overhead)
        important_data: Optional existing important data dict (used as overhead)
        max_tokens: Maximum tokens for keep window (default: 2500)
        
    Returns:
        Tuple of (keep_window_messages, keep_indices):
            - keep_window_messages: List of messages to keep
            - keep_indices: List of indices in original messages array
            
    Example:
        >>> messages = [{"role": "user", "content": f"Message {i}"} for i in range(10)]
        >>> keep_window, indices = determine_keep_window(messages, "System prompt", max_tokens=100)
        >>> len(keep_window)  # Returns last N messages fitting in available tokens
        4
    """
    if not messages:
        return [], []
    
    # Calculate overhead for system prompt, summary, and important data
    overhead = count_tokens_for_system_prompt(system_prompt)
    if conversation_summary:
        overhead += count_tokens_for_summary(conversation_summary) + 5  # Header overhead
    if important_data:
        overhead += count_tokens_for_important_data(important_data) + 5  # Header overhead
    
    # Available tokens for messages after overhead
    available_tokens = max_tokens - overhead
    
    # If overhead already exceeds max_tokens, return empty (edge case)
    if available_tokens <= 0:
        logger.warning(f"Overhead ({overhead}) exceeds max_tokens ({max_tokens}), keeping no messages")
        return [], []
    
    # Work backwards from the end to find messages that fit
    keep_messages = []
    keep_indices = []
    current_tokens = 0
    
    # Iterate backwards through messages
    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        msg_tokens = count_tokens_for_message(msg)
        
        # Check if adding this message would exceed limit
        if current_tokens + msg_tokens > available_tokens:
            # Stop if we can't fit this message
            break
        
        # Add message to keep window (insert at beginning to maintain order)
        keep_messages.insert(0, msg)
        keep_indices.insert(0, i)
        current_tokens += msg_tokens
    
    logger.debug(
        f"Keep window: {len(keep_messages)} messages, {current_tokens} tokens "
        f"(available: {available_tokens}, overhead: {overhead})"
    )
    
    return keep_messages, keep_indices


def get_messages_to_summarize(
    messages: List[Dict],
    keep_indices: List[int]
) -> List[Dict]:
    """
    Get messages that should be summarized (all messages except those in keep window).
    
    Args:
        messages: List of all message dicts
        keep_indices: List of indices of messages to keep (not summarize)
        
    Returns:
        List of message dicts to summarize (excludes keep window messages)
        
    Example:
        >>> messages = [{"role": "user", "content": f"Message {i}"} for i in range(10)]
        >>> keep_indices = [8, 9]  # Keep last 2 messages
        >>> to_summarize = get_messages_to_summarize(messages, keep_indices)
        >>> len(to_summarize)  # Returns first 8 messages
        8
    """
    if not messages:
        return []
    
    if not keep_indices:
        # If no keep window, all messages should be summarized
        return messages.copy()
    
    # Create set for faster lookup
    keep_set = set(keep_indices)
    
    # Get all messages not in keep window
    messages_to_summarize = [
        msg for i, msg in enumerate(messages)
        if i not in keep_set
    ]
    
    logger.debug(
        f"Messages to summarize: {len(messages_to_summarize)} "
        f"(total: {len(messages)}, keep: {len(keep_indices)})"
    )
    
    return messages_to_summarize


def get_messages_since_last_summary(
    messages: List[Dict],
    last_keep_window_index: int
) -> List[Dict]:
    """
    Get messages that were added since the last summarization.
    
    This is used for incremental summarization - we only need to summarize
    new messages since the last summary, plus regenerate the summary.
    
    Args:
        messages: List of all message dicts
        last_keep_window_index: The first index that was kept in the last summary
                                (all messages before this were already summarized)
        
    Returns:
        List of message dicts added since last summary
        
    Example:
        >>> messages = [{"role": "user", "content": f"Message {i}"} for i in range(10)]
        >>> last_keep_window_index = 5  # Last summary kept messages from index 5 onwards
        >>> new_messages = get_messages_since_last_summary(messages, 5)
        >>> len(new_messages)  # Returns messages from index 0-4 (already summarized)
        5
    """
    if not messages:
        return []
    
    if last_keep_window_index >= len(messages):
        # All messages are new since last summary
        return messages.copy()
    
    # Return messages before the last keep window index
    # These are the messages that were summarized previously
    # (Note: this is for incremental summarization - we'll include old summary in prompt)
    messages_since = messages[:last_keep_window_index]
    
    logger.debug(
        f"Messages since last summary: {len(messages_since)} "
        f"(last_keep_window_index: {last_keep_window_index}, total: {len(messages)})"
    )
    
    return messages_since


# ============================================================================
# Phase 4: Important Data Extraction Service
# ============================================================================

def extract_important_data(messages: List[Dict]) -> Dict:
    """
    Extract structured important data from messages using GPT-4o-mini.
    
    Extracts critical facts, preferences, decisions, and information that must be preserved.
    
    Args:
        messages: List of message dicts to extract important data from
        
    Returns:
        Dict with structure:
        {
            "user_preferences": {},
            "key_decisions": [],
            "important_facts": [],
            "source_urls": [],
            "document_structure": {},
            "entities": [],
            "custom_fields": {}
        }
        
    Example:
        >>> messages = [
        ...     {"role": "user", "content": "I prefer dark mode. My document should have sections for Introduction, Methods."},
        ...     {"role": "assistant", "content": "Noted. I'll structure your document accordingly."},
        ...     {"role": "user", "content": "Important sources: https://example.com/paper1, https://example.com/paper2"}
        ... ]
        >>> important_data = extract_important_data(messages)
        >>> important_data["user_preferences"]["theme"]  # Should extract "dark mode"
        'dark'
    """
    if not messages:
        # Return empty structure
        return {
            "user_preferences": {},
            "key_decisions": [],
            "important_facts": [],
            "source_urls": [],
            "document_structure": {},
            "entities": [],
            "custom_fields": {}
        }
    
    try:
        # Format messages for extraction
        messages_text = []
        for msg in messages:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            if content:
                messages_text.append(f"{role}: {content}")
        
        conversation_text = "\n".join(messages_text)
        
        # Create extraction prompt
        extraction_prompt = """You are extracting important structured data from a conversation that will be summarized.

Extract ONLY critical facts, preferences, decisions, and information that must be preserved and never forgotten.
Focus on:
- User preferences (theme, formatting, style, workflow preferences)
- Key decisions made during the conversation
- Important facts, findings, or conclusions that are critical to remember
- Source URLs or citations that must be preserved
- Document structure requirements (sections, organization)
- Named entities (people, places, organizations, concepts) that are important
- Any custom information that is critical for future context

Return ONLY valid JSON with this exact structure (only include fields that have data):
{
  "user_preferences": {},
  "key_decisions": [],
  "important_facts": [],
  "source_urls": [],
  "document_structure": {},
  "entities": [],
  "custom_fields": {}
}

Be concise but comprehensive. Only extract information that is truly important and must be preserved.

Conversation to extract from:
"""
        
        # Combine prompt and conversation
        full_prompt = extraction_prompt + conversation_text
        
        # Call GPT-4o-mini for extraction
        openai_client = OpenAI(api_key=Config.OPENAI_API_KEY)
        
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a data extraction assistant. Return only valid JSON, no additional text."},
                {"role": "user", "content": full_prompt}
            ],
            temperature=0.3,  # Lower temperature for more consistent extraction
            max_tokens=1000  # Sufficient for structured data
        )
        
        content = response.choices[0].message.content.strip()
        
        # Parse JSON response
        # Remove markdown code blocks if present
        if content.startswith("```"):
            # Extract JSON from code block
            json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*\})\s*```', content)
            if json_match:
                content = json_match.group(1)
            else:
                # Try to find JSON in content
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    content = json_match.group(0)
        
        # Parse JSON
        try:
            extracted_data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON from extraction response: {e}")
            logger.debug(f"Response content: {content[:500]}...")
            # Return empty structure on parse error
            return {
                "user_preferences": {},
                "key_decisions": [],
                "important_facts": [],
                "source_urls": [],
                "document_structure": {},
                "entities": [],
                "custom_fields": {}
            }
        
        # Validate and ensure all required fields exist
        validated_data = {
            "user_preferences": extracted_data.get("user_preferences", {}),
            "key_decisions": extracted_data.get("key_decisions", []),
            "important_facts": extracted_data.get("important_facts", []),
            "source_urls": extracted_data.get("source_urls", []),
            "document_structure": extracted_data.get("document_structure", {}),
            "entities": extracted_data.get("entities", []),
            "custom_fields": extracted_data.get("custom_fields", {})
        }
        
        # Ensure types are correct
        if not isinstance(validated_data["user_preferences"], dict):
            validated_data["user_preferences"] = {}
        if not isinstance(validated_data["key_decisions"], list):
            validated_data["key_decisions"] = []
        if not isinstance(validated_data["important_facts"], list):
            validated_data["important_facts"] = []
        if not isinstance(validated_data["source_urls"], list):
            validated_data["source_urls"] = []
        if not isinstance(validated_data["document_structure"], dict):
            validated_data["document_structure"] = {}
        if not isinstance(validated_data["entities"], list):
            validated_data["entities"] = []
        if not isinstance(validated_data["custom_fields"], dict):
            validated_data["custom_fields"] = {}
        
        logger.debug(f"Extracted important data: {len(validated_data['key_decisions'])} decisions, "
                    f"{len(validated_data['important_facts'])} facts, {len(validated_data['source_urls'])} URLs")
        
        return validated_data
        
    except Exception as e:
        log_error(logger, e, "Error extracting important data from messages")
        # Return empty structure on error
        return {
            "user_preferences": {},
            "key_decisions": [],
            "important_facts": [],
            "source_urls": [],
            "document_structure": {},
            "entities": [],
            "custom_fields": {}
        }


def merge_important_data(existing_data: Dict, new_data: Dict) -> Dict:
    """
    Merge new important data with existing important data.
    
    Important data should never be erased - only add more information.
    Arrays are merged and deduplicated. Dicts are merged (existing keys preserved, new keys added).
    
    Args:
        existing_data: Existing important data dict
        new_data: New important data dict to merge
        
    Returns:
        Dict with merged important data
        
    Example:
        >>> existing = {"user_preferences": {"theme": "dark"}, "source_urls": ["url1"]}
        >>> new = {"user_preferences": {"font": "arial"}, "source_urls": ["url2"]}
        >>> merged = merge_important_data(existing, new)
        >>> merged["user_preferences"]  # Should have both theme and font
        {"theme": "dark", "font": "arial"}
        >>> merged["source_urls"]  # Should have both URLs (deduplicated)
        ["url1", "url2"]
    """
    if not existing_data:
        existing_data = {
            "user_preferences": {},
            "key_decisions": [],
            "important_facts": [],
            "source_urls": [],
            "document_structure": {},
            "entities": [],
            "custom_fields": {}
        }
    
    if not new_data:
        return existing_data.copy()
    
    merged = {
        "user_preferences": existing_data.get("user_preferences", {}).copy(),
        "key_decisions": existing_data.get("key_decisions", []).copy(),
        "important_facts": existing_data.get("important_facts", []).copy(),
        "source_urls": existing_data.get("source_urls", []).copy(),
        "document_structure": existing_data.get("document_structure", {}).copy(),
        "entities": existing_data.get("entities", []).copy(),
        "custom_fields": existing_data.get("custom_fields", {}).copy()
    }
    
    # Merge user_preferences (dict - preserve existing, add new)
    if isinstance(new_data.get("user_preferences"), dict):
        merged["user_preferences"].update(new_data["user_preferences"])
    
    # Merge key_decisions (list - append new, deduplicate)
    if isinstance(new_data.get("key_decisions"), list):
        for decision in new_data["key_decisions"]:
            if decision and decision not in merged["key_decisions"]:
                merged["key_decisions"].append(decision)
    
    # Merge important_facts (list - append new, deduplicate)
    if isinstance(new_data.get("important_facts"), list):
        for fact in new_data["important_facts"]:
            if fact and fact not in merged["important_facts"]:
                merged["important_facts"].append(fact)
    
    # Merge source_urls (list - append new, deduplicate)
    if isinstance(new_data.get("source_urls"), list):
        for url in new_data["source_urls"]:
            if url and url not in merged["source_urls"]:
                merged["source_urls"].append(url)
    
    # Merge document_structure (dict - preserve existing, add new, merge nested if needed)
    if isinstance(new_data.get("document_structure"), dict):
        existing_structure = merged["document_structure"]
        new_structure = new_data["document_structure"]
        
        # If both have "sections" or similar lists, merge them
        if "sections" in existing_structure and "sections" in new_structure:
            # Merge sections lists
            if isinstance(existing_structure["sections"], list) and isinstance(new_structure["sections"], list):
                for section in new_structure["sections"]:
                    if section not in existing_structure["sections"]:
                        existing_structure["sections"].append(section)
        else:
            # Simple dict merge
            existing_structure.update(new_structure)
    
    # Merge entities (list - append new, deduplicate)
    if isinstance(new_data.get("entities"), list):
        for entity in new_data["entities"]:
            if entity and entity not in merged["entities"]:
                merged["entities"].append(entity)
    
    # Merge custom_fields (dict - preserve existing, add new)
    if isinstance(new_data.get("custom_fields"), dict):
        merged["custom_fields"].update(new_data["custom_fields"])
    
    logger.debug(f"Merged important data: {len(merged['key_decisions'])} decisions, "
                f"{len(merged['important_facts'])} facts, {len(merged['source_urls'])} URLs")
    
    return merged


# ============================================================================
# Phase 5: Conversation Summary Generation Service
# ============================================================================

def calculate_target_word_count(summary_version: int) -> Tuple[int, int]:
    """
    Calculate target word count range based on summary version.
    
    Progressive word count:
    - Version 1: 100-150 words
    - Version 2: 200-250 words
    - Version 3: 300-350 words
    - Version 4: 400-450 words
    - Version 5+: 500-750 words (cap)
    
    Args:
        summary_version: Version number (1, 2, 3, etc.)
        
    Returns:
        Tuple of (min_words, max_words) target range
        
    Example:
        >>> calculate_target_word_count(1)
        (100, 150)
        >>> calculate_target_word_count(5)
        (500, 750)
    """
    if summary_version <= 0:
        summary_version = 1
    
    if summary_version == 1:
        return (100, 150)
    elif summary_version == 2:
        return (200, 250)
    elif summary_version == 3:
        return (300, 350)
    elif summary_version == 4:
        return (400, 450)
    else:
        # Version 5+: Cap at 500-750 words
        return (500, 750)


def generate_conversation_summary(
    messages: List[Dict],
    previous_summary: Optional[str] = None,
    summary_version: int = 1
) -> str:
    """
    Generate a progressive conversation summary using GPT-4o-mini.
    
    Handles both first-time summarization (messages only) and incremental
    summarization (previous summary + new messages).
    
    Args:
        messages: List of message dicts to summarize
        previous_summary: Optional previous summary to incorporate (for incremental)
        summary_version: Version number for progressive word count (default: 1)
        
    Returns:
        str: Generated conversation summary
        
    Example:
        >>> messages = [
        ...     {"role": "user", "content": "I'm writing a paper about AI."},
        ...     {"role": "assistant", "content": "I'll help you write it."}
        ... ]
        >>> summary = generate_conversation_summary(messages, previous_summary=None, summary_version=1)
        >>> word_count = len(summary.split())
        >>> 100 <= word_count <= 150  # Should be in range
        True
    """
    if not messages and not previous_summary:
        # No content to summarize
        return ""
    
    try:
        # Calculate target word count based on version
        min_words, max_words = calculate_target_word_count(summary_version)
        target_words = (min_words + max_words) // 2  # Use midpoint as target
        
        # Format messages for summarization
        messages_text = []
        for msg in messages:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            if content:
                messages_text.append(f"{role}: {content}")
        
        conversation_text = "\n".join(messages_text) if messages_text else ""
        
        # Create summary prompt
        if previous_summary:
            # Incremental summarization: incorporate previous summary + new messages
            summary_prompt = f"""Summarize this conversation history into a coherent narrative summary.

Focus on:
- Main topics discussed
- Key user requests and AI responses
- Important context and flow
- Any critical information for future reference

Keep it concise but comprehensive. Target word count: approximately {target_words} words (between {min_words} and {max_words} words).

PREVIOUS SUMMARY (preserve important context from this):
{previous_summary}

NEW MESSAGES TO INCORPORATE (add these to the summary):
{conversation_text}

Create an updated summary that:
1. Preserves important context from the previous summary
2. Incorporates the new messages above
3. Maintains a coherent narrative flow
4. Is approximately {target_words} words (between {min_words} and {max_words} words)

Return only the summary text, no additional explanations or formatting."""
        else:
            # First-time summarization: summarize messages only
            summary_prompt = f"""Summarize this conversation history into a coherent narrative summary.

Focus on:
- Main topics discussed
- Key user requests and AI responses
- Important context and flow
- Any critical information for future reference

Keep it concise but comprehensive. Target word count: approximately {target_words} words (between {min_words} and {max_words} words).

CONVERSATION TO SUMMARIZE:
{conversation_text}

Return only the summary text, no additional explanations or formatting."""
        
        # Call GPT-4o-mini for summary generation
        openai_client = OpenAI(api_key=Config.OPENAI_API_KEY)
        
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a summarization assistant. Generate concise, coherent narrative summaries of conversations. Return only the summary text without additional formatting or explanations."
                },
                {"role": "user", "content": summary_prompt}
            ],
            temperature=0.5,  # Moderate temperature for coherent summaries
            max_tokens=min(max_words * 2, 2000)  # Ensure enough tokens (roughly 2 tokens per word, with buffer)
        )
        
        summary = response.choices[0].message.content.strip()
        
        # Clean up summary (remove markdown formatting if present)
        # Remove markdown code blocks
        if summary.startswith("```"):
            summary_lines = summary.split('\n')
            # Remove first line (```) and last line (```)
            if len(summary_lines) > 2:
                summary = '\n'.join(summary_lines[1:-1])
        
        # Remove leading/trailing quotes if present
        summary = summary.strip('"\'')
        
        # Verify word count is in reasonable range
        word_count = len(summary.split())
        
        if word_count < min_words * 0.7:
            # Summary is too short - log warning but return it anyway
            logger.warning(
                f"Generated summary is shorter than expected: {word_count} words "
                f"(target: {min_words}-{max_words} words, version: {summary_version})"
            )
        elif word_count > max_words * 1.2:
            # Summary is longer than expected - log warning but return it anyway
            logger.warning(
                f"Generated summary is longer than expected: {word_count} words "
                f"(target: {min_words}-{max_words} words, version: {summary_version})"
            )
        else:
            logger.debug(
                f"Generated summary: {word_count} words "
                f"(target: {min_words}-{max_words} words, version: {summary_version})"
            )
        
        return summary
        
    except Exception as e:
        log_error(logger, e, "Error generating conversation summary")
        # Return empty string on error
        logger.error(f"Failed to generate summary for version {summary_version}")
        return ""


# ============================================================================
# Phase 6: Summarization Orchestration
# ============================================================================

def orchestrate_summarization(
    session_id: str,
    messages: List[Dict],
    system_prompt: str
) -> Optional[Dict]:
    """
    Orchestrate summarization process: check, execute, and update memory compression.
    
    This function:
    1. Checks if summarization is needed (only counts messages, not system_prompt)
    2. Gets existing memory compression or initializes
    3. Determines keep window (recent messages to keep)
    4. Extracts important data and generates summary
    5. Merges important data and updates memory compression
    6. Returns updated memory compression data
    
    Args:
        session_id: Session ID
        messages: List of all messages (user + assistant)
        system_prompt: System prompt text (used for overhead calculation only)
        
    Returns:
        Dict with updated memory compression data, or None if no summarization needed
    """
    from models.database import ChatSessionModel
    
    logger.debug("=" * 80)
    logger.debug("[MEMORY] Starting summarization orchestration check")
    logger.debug("=" * 80)
    logger.debug(f"[MEMORY] Session ID: {session_id}")
    logger.debug(f"[MEMORY] Total messages: {len(messages)}")
    
    # Step 1: Check if we should summarize (only count messages, not system_prompt)
    logger.debug(f"[MEMORY] Checking if summarization needed (threshold: {TOKEN_THRESHOLD} tokens)")
    should_sum = should_summarize(messages, threshold=TOKEN_THRESHOLD)
    
    if not should_sum:
        logger.debug(f"[MEMORY] Summarization NOT needed - messages under threshold")
        return None
    
    logger.info(f"[MEMORY] ✓ Summarization needed - messages exceed {TOKEN_THRESHOLD} tokens")
    
    # Step 2: Get existing memory compression or initialize
    logger.debug(f"[MEMORY] Getting existing memory compression...")
    memory = ChatSessionModel.get_memory_compression(session_id)
    
    if not memory:
        logger.debug(f"[MEMORY] No existing memory compression found, initializing...")
        ChatSessionModel.initialize_memory_compression(session_id)
        memory = ChatSessionModel.get_memory_compression(session_id)
        logger.debug(f"[MEMORY] Memory compression initialized")
    else:
        logger.debug(f"[MEMORY] Found existing memory compression (version: {memory.get('summary_version', 0)})")
    
    # Step 3: Determine keep window
    logger.debug(f"[MEMORY] Determining keep window (max tokens: {KEEP_WINDOW_MAX_TOKENS})...")
    keep_window, keep_indices = determine_keep_window(
        messages=messages,
        system_prompt=system_prompt,
        conversation_summary=memory.get('conversation_summary'),
        important_data=memory.get('important_data'),
        max_tokens=KEEP_WINDOW_MAX_TOKENS
    )
    
    logger.info(f"[MEMORY] ✓ Keep window: {len(keep_window)} messages (indices: {keep_indices})")
    
    # Step 4: Get messages to summarize
    messages_to_summarize = get_messages_to_summarize(messages, keep_indices)
    logger.info(f"[MEMORY] ✓ Messages to summarize: {len(messages_to_summarize)} messages")
    
    # Step 5: Extract important data and generate summary
    is_first_time = memory.get('summary_version', 0) == 0
    
    if is_first_time:
        logger.info(f"[MEMORY] First-time summarization (version: 1)")
        logger.debug(f"[MEMORY] Extracting important data from {len(messages_to_summarize)} messages...")
        important_data_new = extract_important_data(messages_to_summarize)
        logger.info(f"[MEMORY] ✓ Extracted important data: {len(important_data_new.get('key_decisions', []))} decisions, "
                   f"{len(important_data_new.get('important_facts', []))} facts, "
                   f"{len(important_data_new.get('source_urls', []))} URLs")
        
        logger.debug(f"[MEMORY] Generating first summary (version 1, target: 100-150 words)...")
        summary_new = generate_conversation_summary(
            messages=messages_to_summarize,
            previous_summary=None,
            summary_version=1
        )
        logger.info(f"[MEMORY] ✓ Generated summary (version 1): {len(summary_new)} chars, {len(summary_new.split())} words")
    else:
        # Incremental summarization
        current_version = memory.get('summary_version', 0)
        new_version = current_version + 1
        previous_summary = memory.get('conversation_summary', '')
        
        logger.info(f"[MEMORY] Incremental summarization (version {current_version} -> {new_version})")
        logger.debug(f"[MEMORY] Extracting important data from {len(messages_to_summarize)} messages (not in current keep window)...")
        important_data_new = extract_important_data(messages_to_summarize)
        logger.info(f"[MEMORY] ✓ Extracted new important data: {len(important_data_new.get('key_decisions', []))} decisions, "
                   f"{len(important_data_new.get('important_facts', []))} facts, "
                   f"{len(important_data_new.get('source_urls', []))} URLs")
        
        logger.debug(f"[MEMORY] Regenerating summary (version {new_version}, previous summary: {len(previous_summary)} chars, "
                    f"new messages: {len(messages_to_summarize)})...")
        summary_new = generate_conversation_summary(
            messages=messages_to_summarize,
            previous_summary=previous_summary,
            summary_version=new_version
        )
        logger.info(f"[MEMORY] ✓ Generated summary (version {new_version}): {len(summary_new)} chars, {len(summary_new.split())} words")
    
    # Step 6: Merge important data
    logger.debug(f"[MEMORY] Merging important data (existing + new)...")
    existing_important_data = memory.get('important_data', {})
    merged_important_data = merge_important_data(existing_important_data, important_data_new)
    logger.info(f"[MEMORY] ✓ Merged important data: {len(merged_important_data.get('key_decisions', []))} total decisions, "
               f"{len(merged_important_data.get('important_facts', []))} total facts, "
               f"{len(merged_important_data.get('source_urls', []))} total URLs")
    
    # Step 7: Build updated memory compression data
    new_version = (memory.get('summary_version', 0) + 1) if not is_first_time else 1
    updated_memory = {
        'important_data': merged_important_data,
        'conversation_summary': summary_new,
        'summary_version': new_version,
        'last_summarized_at': datetime.utcnow().isoformat(),
        'messages_summarized_count': memory.get('messages_summarized_count', 0) + len(messages_to_summarize),
        'last_keep_window_index': keep_indices[0] if keep_indices else 0
    }
    
    logger.info(f"[MEMORY] ✓ Updated memory compression (version: {new_version}, "
               f"messages_summarized_count: {updated_memory['messages_summarized_count']}, "
               f"last_keep_window_index: {updated_memory['last_keep_window_index']})")
    
    # Step 8: Update database
    logger.debug(f"[MEMORY] Updating memory compression in database...")
    ChatSessionModel.update_memory_compression(session_id, updated_memory)
    logger.info(f"[MEMORY] ✓ Memory compression updated in database")
    
    logger.debug("=" * 80)
    logger.debug("[MEMORY] Summarization orchestration completed successfully")
    logger.debug("=" * 80)
    
    return updated_memory

