# Comprehensive Test Plan: Memory Management System (Phases 1-5)

## Overview

This document provides comprehensive testing instructions for the memory management and compression system implementation (Phases 1-5). It includes test cases, sample messages for AI interactions, and verification steps for all implemented functions.

---

## Table of Contents

1. [Phase 1: Token Counting Infrastructure](#phase-1-token-counting-infrastructure)
2. [Phase 2: Database Schema and Memory Compression Model](#phase-2-database-schema-and-memory-compression-model)
3. [Phase 3: Token Threshold Detection and Message Window Logic](#phase-3-token-threshold-detection-and-message-window-logic)
4. [Phase 4: Important Data Extraction Service](#phase-4-important-data-extraction-service)
5. [Phase 5: Conversation Summary Generation Service](#phase-5-conversation-summary-generation-service)
6. [Integration Tests](#integration-tests)
7. [End-to-End Flow Tests](#end-to-end-flow-tests)

---

## Prerequisites

1. Install dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. Ensure environment variables are set:
   - `OPENAI_API_KEY` - Required for Phase 4 and 5
   - `MONGODB_URI` - Required for Phase 2
   - Other environment variables as needed

3. MongoDB should be running and accessible

4. Test user and project should exist (or create them during testing)

---

## Phase 1: Token Counting Infrastructure

### Test 1.1: Basic Token Counting

**Objective**: Verify `count_tokens()` function works correctly

**Steps**:
```python
from services.memory_service import count_tokens

# Test 1: Simple text
text1 = "Hello, world!"
tokens1 = count_tokens(text1)
print(f"Text: '{text1}'")
print(f"Tokens: {tokens1}")
assert tokens1 > 0, "Should return positive token count"
assert tokens1 < 10, "Short text should have few tokens"

# Test 2: Longer text
text2 = "This is a longer sentence with more words to count tokens for."
tokens2 = count_tokens(text2)
print(f"Text: '{text2}'")
print(f"Tokens: {tokens2}")
assert tokens2 > tokens1, "Longer text should have more tokens"

# Test 3: Empty text
tokens3 = count_tokens("")
assert tokens3 == 0, "Empty text should return 0 tokens"

# Test 4: Multi-line text
text4 = "Line one.\nLine two.\nLine three."
tokens4 = count_tokens(text4)
print(f"Multi-line text tokens: {tokens4}")
assert tokens4 > 0, "Multi-line text should have tokens"
```

**Expected Result**: All assertions pass, tokens are counted correctly

---

### Test 1.2: Message Token Counting

**Objective**: Verify token counting for individual messages

**Steps**:
```python
from services.memory_service import count_tokens_for_message

# Test 1: Simple user message
msg1 = {"role": "user", "content": "Hello, how are you?"}
tokens1 = count_tokens_for_message(msg1)
print(f"Message 1 tokens: {tokens1}")
assert tokens1 >= 4, "Should account for role and formatting overhead"

# Test 2: Assistant message with sources
msg2 = {
    "role": "assistant",
    "content": "I'm doing well, thank you!",
    "sources": ["https://example.com/paper1", "https://example.com/paper2"]
}
tokens2 = count_tokens_for_message(msg2)
print(f"Message 2 tokens: {tokens2}")
assert tokens2 > tokens1, "Message with sources should have more tokens"

# Test 3: Message with document content
msg3 = {
    "role": "assistant",
    "content": "Here's some content for you.",
    "document_content": "# Introduction\nThis is the introduction section.\n\n## Background\nThis is background."
}
tokens3 = count_tokens_for_message(msg3)
print(f"Message 3 tokens: {tokens3}")
assert tokens3 > tokens1, "Message with document content should have more tokens"
```

**Expected Result**: All assertions pass, tokens account for all message fields

---

### Test 1.3: Multiple Messages Token Counting

**Objective**: Verify token counting for message arrays

**Steps**:
```python
from services.memory_service import count_tokens_for_messages

messages = [
    {"role": "user", "content": "What is machine learning?"},
    {"role": "assistant", "content": "Machine learning is a subset of artificial intelligence."},
    {"role": "user", "content": "Can you explain neural networks?"},
    {"role": "assistant", "content": "Neural networks are computing systems inspired by biological neural networks."}
]

total_tokens = count_tokens_for_messages(messages)
print(f"Total tokens for {len(messages)} messages: {total_tokens}")

# Calculate individual tokens
individual_total = sum(count_tokens_for_message(msg) for msg in messages)
print(f"Sum of individual tokens: {individual_total}")

assert total_tokens == individual_total, "Total should equal sum of individual counts"
assert total_tokens > 0, "Should have positive token count"
```

**Expected Result**: Total equals sum of individual counts

---

### Test 1.4: System Prompt and Summary Token Counting

**Objective**: Verify token counting for system prompts and summaries

**Steps**:
```python
from services.memory_service import (
    count_tokens_for_system_prompt,
    count_tokens_for_summary,
    count_tokens_for_important_data
)

# Test system prompt
system_prompt = "You are a helpful research assistant. Help users write research papers."
sys_tokens = count_tokens_for_system_prompt(system_prompt)
print(f"System prompt tokens: {sys_tokens}")
assert sys_tokens > count_tokens(system_prompt), "Should add overhead for role"

# Test summary
summary = "The user started a research paper about artificial intelligence. They requested sections on introduction and methodology."
sum_tokens = count_tokens_for_summary(summary)
print(f"Summary tokens: {sum_tokens}")
assert sum_tokens == count_tokens(summary), "Summary should be counted as-is"

# Test important data
important_data = {
    "user_preferences": {"style": "APA", "format": "academic"},
    "key_decisions": ["Use APA style", "Include citations"],
    "important_facts": ["Paper is about AI"],
    "source_urls": ["https://example.com/paper1"],
    "document_structure": {"sections": ["Introduction", "Methods"]},
    "entities": [],
    "custom_fields": {}
}
data_tokens = count_tokens_for_important_data(important_data)
print(f"Important data tokens: {data_tokens}")
assert data_tokens > 0, "Should count tokens for important data"
```

**Expected Result**: All token counts are positive and reasonable

---

## Phase 2: Database Schema and Memory Compression Model

### Test 2.1: Initialize Memory Compression

**Objective**: Verify memory compression initialization

**Steps**:
```python
from models.database import ChatSessionModel, Database

# Ensure database is connected
Database.connect()

# Create test user and project (or use existing)
user_id = "test_user_id"  # Replace with actual user_id
project_id = "test_project_id"  # Replace with actual project_id

# Create a session
session_id = ChatSessionModel.create_session(user_id, project_id)
print(f"Created session: {session_id}")

# Initialize memory compression
result = ChatSessionModel.initialize_memory_compression(session_id)
assert result == True, "Should successfully initialize memory compression"

# Verify in MongoDB
session = ChatSessionModel.get_session(session_id)
assert 'memory_compression' in session, "Session should have memory_compression field"

memory = session['memory_compression']
print(f"Memory compression structure: {memory}")

# Verify structure
assert 'important_data' in memory
assert 'conversation_summary' in memory
assert 'summary_version' in memory
assert 'last_summarized_at' in memory
assert 'messages_summarized_count' in memory
assert 'last_keep_window_index' in memory

# Verify important_data structure
important_data = memory['important_data']
assert 'user_preferences' in important_data
assert 'key_decisions' in important_data
assert 'important_facts' in important_data
assert 'source_urls' in important_data
assert 'document_structure' in important_data
assert 'entities' in important_data
assert 'custom_fields' in important_data

# Verify initial values
assert memory['conversation_summary'] == ''
assert memory['summary_version'] == 0
assert memory['last_summarized_at'] is None
assert memory['messages_summarized_count'] == 0
assert memory['last_keep_window_index'] == 0

print("✓ Memory compression initialized correctly")
```

**Expected Result**: All assertions pass, structure matches expected schema

---

### Test 2.2: Get Memory Compression

**Objective**: Verify retrieval of memory compression data

**Steps**:
```python
from models.database import ChatSessionModel

# Get memory compression
memory = ChatSessionModel.get_memory_compression(session_id)
assert memory is not None, "Should return memory compression data"

# Verify all fields exist
assert 'important_data' in memory
assert 'conversation_summary' in memory
assert 'summary_version' in memory

print("✓ Memory compression retrieved correctly")
```

**Expected Result**: Memory compression data is retrieved successfully

---

### Test 2.3: Update Memory Compression

**Objective**: Verify updating memory compression data

**Steps**:
```python
from models.database import ChatSessionModel
from datetime import datetime

# Create updated memory compression data
updated_data = {
    "important_data": {
        "user_preferences": {"theme": "dark", "style": "APA"},
        "key_decisions": ["Use dark theme", "Follow APA style"],
        "important_facts": ["User prefers dark mode"],
        "source_urls": ["https://example.com/paper1"],
        "document_structure": {"sections": ["Introduction"]},
        "entities": ["AI", "Machine Learning"],
        "custom_fields": {}
    },
    "conversation_summary": "User started working on a research paper about AI.",
    "summary_version": 1,
    "last_summarized_at": datetime.utcnow().isoformat(),
    "messages_summarized_count": 10,
    "last_keep_window_index": 5
}

# Update memory compression
result = ChatSessionModel.update_memory_compression(session_id, updated_data)
assert result == True, "Should successfully update memory compression"

# Verify update
memory = ChatSessionModel.get_memory_compression(session_id)
assert memory['summary_version'] == 1
assert memory['conversation_summary'] == "User started working on a research paper about AI."
assert memory['messages_summarized_count'] == 10
assert memory['last_keep_window_index'] == 5
assert memory['important_data']['user_preferences']['theme'] == "dark"
assert len(memory['important_data']['key_decisions']) == 2
assert len(memory['important_data']['source_urls']) == 1

print("✓ Memory compression updated correctly")
```

**Expected Result**: All updates are persisted correctly

---

### Test 2.4: Clear Memory Compression

**Objective**: Verify clearing memory compression (for testing)

**Steps**:
```python
from models.database import ChatSessionModel

# Clear memory compression
result = ChatSessionModel.clear_memory_compression(session_id)
assert result == True, "Should successfully clear memory compression"

# Verify cleared
memory = ChatSessionModel.get_memory_compression(session_id)
assert memory is None, "Memory compression should be None after clearing"

print("✓ Memory compression cleared correctly")
```

**Expected Result**: Memory compression is cleared successfully

---

## Phase 3: Token Threshold Detection and Message Window Logic

### Test 3.1: Should Summarize Decision

**Objective**: Verify `should_summarize()` only counts messages

**Steps**:
```python
from services.memory_service import should_summarize

# Test 1: Short conversation (should NOT summarize)
short_messages = [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"}
]
should_sum = should_summarize(short_messages, threshold=3000)
assert should_sum == False, "Short conversation should not trigger summarization"

# Test 2: Long conversation (should summarize)
# Create messages that exceed 3000 tokens
long_messages = []
for i in range(30):
    long_messages.append({
        "role": "user" if i % 2 == 0 else "assistant",
        "content": f"Message {i}: " + "word " * 100  # Long message
    })

should_sum = should_summarize(long_messages, threshold=3000)
assert should_sum == True, "Long conversation should trigger summarization"

print(f"Short conversation: should_summarize = {should_summarize(short_messages)}")
print(f"Long conversation: should_summarize = {should_summarize(long_messages)}")
```

**Expected Result**: Only message tokens affect summarization decision

---

### Test 3.2: Determine Keep Window

**Objective**: Verify keep window calculation accounts for overhead

**Steps**:
```python
from services.memory_service import determine_keep_window, count_tokens_for_messages

# Create messages
messages = []
for i in range(20):
    messages.append({
        "role": "user" if i % 2 == 0 else "assistant",
        "content": f"Message {i}: " + "word " * 50
    })

system_prompt = "You are a helpful research assistant."
conversation_summary = "Previous summary of conversation."
important_data = {
    "user_preferences": {"style": "APA"},
    "key_decisions": [],
    "important_facts": [],
    "source_urls": [],
    "document_structure": {},
    "entities": [],
    "custom_fields": {}
}

# Determine keep window
keep_window, keep_indices = determine_keep_window(
    messages=messages,
    system_prompt=system_prompt,
    conversation_summary=conversation_summary,
    important_data=important_data,
    max_tokens=2500
)

print(f"Total messages: {len(messages)}")
print(f"Keep window: {len(keep_window)} messages")
print(f"Keep indices: {keep_indices}")

# Verify keep window fits in available tokens
keep_tokens = count_tokens_for_messages(keep_window)
print(f"Keep window tokens: {keep_tokens}")

assert len(keep_window) > 0, "Should keep at least some messages"
assert len(keep_window) <= len(messages), "Keep window should not exceed total messages"
assert keep_window == [messages[i] for i in keep_indices], "Keep window should match indices"

print("✓ Keep window determined correctly")
```

**Expected Result**: Keep window accounts for overhead and fits in token limit

---

### Test 3.3: Get Messages to Summarize

**Objective**: Verify messages to summarize exclude keep window

**Steps**:
```python
from services.memory_service import get_messages_to_summarize

messages = [
    {"role": "user", "content": f"Message {i}"} for i in range(10)
]

# Keep last 3 messages
keep_indices = [7, 8, 9]

# Get messages to summarize
to_summarize = get_messages_to_summarize(messages, keep_indices)

print(f"Total messages: {len(messages)}")
print(f"Keep indices: {keep_indices}")
print(f"Messages to summarize: {len(to_summarize)}")

assert len(to_summarize) == 7, "Should have 7 messages to summarize (0-6)"
assert to_summarize == [messages[i] for i in range(7)], "Should be first 7 messages"

# Verify no overlap
keep_set = set(keep_indices)
summarize_indices = set(range(len(messages))) - keep_set
assert len(keep_set & summarize_indices) == 0, "No overlap between keep and summarize"

print("✓ Messages to summarize determined correctly")
```

**Expected Result**: Messages to summarize exclude keep window correctly

---

### Test 3.4: Get Messages Since Last Summary

**Objective**: Verify incremental message retrieval

**Steps**:
```python
from services.memory_service import get_messages_since_last_summary

messages = [
    {"role": "user", "content": f"Message {i}"} for i in range(15)
]

# Last keep window index was 5 (messages 0-4 were summarized)
last_keep_window_index = 5

messages_since = get_messages_since_last_summary(messages, last_keep_window_index)

print(f"Total messages: {len(messages)}")
print(f"Last keep window index: {last_keep_window_index}")
print(f"Messages since last summary: {len(messages_since)}")

assert len(messages_since) == 5, "Should return first 5 messages (already summarized)"
assert messages_since == messages[:5], "Should be first 5 messages"

print("✓ Messages since last summary determined correctly")
```

**Expected Result**: Correct messages returned for incremental summarization

---

## Phase 4: Important Data Extraction Service

### Test 4.1: Extract Important Data - First Extraction

**Objective**: Verify important data extraction from messages

**Sample Messages for Testing**:
```python
test_messages = [
    {
        "role": "user",
        "content": "I'm writing a research paper about artificial intelligence and machine learning. I prefer to use APA style formatting for citations."
    },
    {
        "role": "assistant",
        "content": "I'll help you write your paper about AI and ML. I'll make sure to use APA style formatting for all citations."
    },
    {
        "role": "user",
        "content": "My document should have these sections: Introduction, Literature Review, Methodology, Results, Discussion, and Conclusion."
    },
    {
        "role": "assistant",
        "content": "Perfect! I'll structure your document with those sections: Introduction, Literature Review, Methodology, Results, Discussion, and Conclusion."
    },
    {
        "role": "user",
        "content": "Here are some important sources I want to cite: https://arxiv.org/abs/1706.03762 (Attention is All You Need), https://arxiv.org/abs/2005.14165 (GPT-3 paper), and https://www.nature.com/articles/nature14539 (DeepMind's Nature paper)"
    },
    {
        "role": "assistant",
        "content": "Got it! I'll include citations for those papers: the Transformer paper, GPT-3 paper, and DeepMind's Nature paper on deep neural networks."
    },
    {
        "role": "user",
        "content": "The key finding I want to highlight is that transformer architectures revolutionized natural language processing by introducing self-attention mechanisms."
    },
    {
        "role": "assistant",
        "content": "I understand. The main point is that transformers revolutionized NLP through self-attention. I'll emphasize this in the paper."
    },
    {
        "role": "user",
        "content": "I also want to mention that OpenAI developed GPT models, Google developed BERT, and DeepMind worked on AlphaGo and protein folding."
    }
]
```

**Test Steps**:
```python
from services.memory_service import extract_important_data
import json

# Extract important data
important_data = extract_important_data(test_messages)

print("Extracted Important Data:")
print(json.dumps(important_data, indent=2))

# Verify structure
assert 'user_preferences' in important_data
assert 'key_decisions' in important_data
assert 'important_facts' in important_data
assert 'source_urls' in important_data
assert 'document_structure' in important_data
assert 'entities' in important_data
assert 'custom_fields' in important_data

# Verify specific extractions
user_prefs = important_data['user_preferences']
assert 'style' in user_prefs or 'formatting' in user_prefs, "Should extract APA style preference"
assert user_prefs.get('style') == 'APA' or user_prefs.get('formatting') == 'APA'

# Verify document structure
doc_structure = important_data['document_structure']
assert 'sections' in doc_structure or 'structure' in doc_structure, "Should extract document sections"
sections = doc_structure.get('sections', [])
assert 'Introduction' in str(sections).lower() or 'Introduction' in str(doc_structure).lower()

# Verify source URLs
source_urls = important_data['source_urls']
assert len(source_urls) >= 3, "Should extract at least 3 source URLs"
assert any('arxiv.org' in url for url in source_urls), "Should extract arxiv URLs"
assert any('1706.03762' in url or '2005.14165' in url for url in source_urls), "Should extract paper URLs"

# Verify important facts
important_facts = important_data['important_facts']
assert len(important_facts) > 0, "Should extract important facts"
assert any('transformer' in str(fact).lower() for fact in important_facts), "Should extract transformer fact"

# Verify entities
entities = important_data['entities']
assert any('openai' in str(e).lower() for e in entities), "Should extract OpenAI entity"
assert any('google' in str(e).lower() or 'bert' in str(e).lower() for e in entities), "Should extract Google/BERT"

print("✓ Important data extracted correctly")
```

**Expected Result**: All important data fields are extracted and populated

---

### Test 4.2: Merge Important Data

**Objective**: Verify merging of important data (append-only)

**Steps**:
```python
from services.memory_service import merge_important_data

# Existing important data
existing = {
    "user_preferences": {"style": "APA", "theme": "dark"},
    "key_decisions": ["Use APA style", "Follow academic format"],
    "important_facts": ["Paper is about AI"],
    "source_urls": ["https://arxiv.org/abs/1706.03762"],
    "document_structure": {"sections": ["Introduction", "Methods"]},
    "entities": ["OpenAI", "Google"],
    "custom_fields": {}
}

# New important data
new_data = {
    "user_preferences": {"font": "Times New Roman"},
    "key_decisions": ["Use Times New Roman font", "Add Results section"],
    "important_facts": ["ML is subset of AI"],
    "source_urls": ["https://arxiv.org/abs/2005.14165", "https://arxiv.org/abs/1706.03762"],  # Duplicate URL
    "document_structure": {"sections": ["Results", "Discussion"]},
    "entities": ["DeepMind"],
    "custom_fields": {"deadline": "2024-12-31"}
}

# Merge
merged = merge_important_data(existing, new_data)

print("Merged Important Data:")
print(json.dumps(merged, indent=2))

# Verify merging
assert merged['user_preferences']['style'] == "APA", "Existing preference preserved"
assert merged['user_preferences']['theme'] == "dark", "Existing preference preserved"
assert merged['user_preferences']['font'] == "Times New Roman", "New preference added"

# Verify arrays are merged (not replaced)
assert len(merged['key_decisions']) >= 4, "Decisions should be merged"
assert "Use APA style" in merged['key_decisions'], "Existing decision preserved"
assert "Use Times New Roman font" in merged['key_decisions'], "New decision added"

# Verify source URLs are deduplicated
assert len(merged['source_urls']) == 2, "Should have 2 unique URLs (deduplicated)"
assert "https://arxiv.org/abs/1706.03762" in merged['source_urls']
assert "https://arxiv.org/abs/2005.14165" in merged['source_urls']

# Verify document structure sections are merged
doc_sections = merged['document_structure'].get('sections', [])
assert 'Introduction' in str(doc_sections).lower() or 'Introduction' in str(merged['document_structure']).lower()
assert 'Results' in str(doc_sections).lower() or 'Results' in str(merged['document_structure']).lower()

# Verify entities are merged
assert len(merged['entities']) >= 3, "Entities should be merged"
assert "OpenAI" in str(merged['entities'])
assert "DeepMind" in str(merged['entities'])

# Verify custom fields
assert merged['custom_fields']['deadline'] == "2024-12-31", "Custom field added"

print("✓ Important data merged correctly (append-only)")
```

**Expected Result**: All data is merged correctly, nothing is deleted

---

### Test 4.3: Extract Important Data - Edge Cases

**Objective**: Test edge cases for important data extraction

**Steps**:
```python
from services.memory_service import extract_important_data

# Test 1: Empty messages
empty_data = extract_important_data([])
assert empty_data['user_preferences'] == {}
assert empty_data['key_decisions'] == []
assert empty_data['important_facts'] == []
assert len(empty_data['source_urls']) == 0

# Test 2: Messages with no extractable data
minimal_messages = [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi"}
]
minimal_data = extract_important_data(minimal_messages)
# Should return empty structure (no important data to extract)
print(f"Minimal messages extracted: {minimal_data}")

# Test 3: Messages with only preferences
pref_messages = [
    {"role": "user", "content": "I like dark mode and serif fonts."}
]
pref_data = extract_important_data(pref_messages)
assert len(pref_data['user_preferences']) > 0, "Should extract preferences"

print("✓ Edge cases handled correctly")
```

**Expected Result**: Edge cases are handled gracefully

---

## Phase 5: Conversation Summary Generation Service

### Test 5.1: First-Time Summary Generation

**Objective**: Verify first-time summary generation (Version 1: 100-150 words)

**Sample Messages for Testing**:
```python
conversation_messages = [
    {
        "role": "user",
        "content": "I'm starting a research paper on artificial intelligence and its applications in healthcare. Can you help me write the introduction?"
    },
    {
        "role": "assistant",
        "content": "I'll help you write an introduction for your paper on AI in healthcare. Let me start by creating a comprehensive introduction that covers the background, significance, and scope of AI applications in healthcare."
    },
    {
        "role": "user",
        "content": "The introduction should mention that AI is transforming healthcare through diagnostic tools, predictive analytics, and personalized treatment recommendations."
    },
    {
        "role": "assistant",
        "content": "Perfect! I'll incorporate those key points about AI transforming healthcare through diagnostic tools, predictive analytics, and personalized treatment. Let me draft a section that emphasizes these transformative applications."
    },
    {
        "role": "user",
        "content": "Also mention that machine learning algorithms can analyze medical images more accurately than traditional methods, and that natural language processing helps extract insights from clinical notes."
    },
    {
        "role": "assistant",
        "content": "Excellent points! I'll add information about how ML algorithms improve medical image analysis accuracy and how NLP extracts valuable insights from clinical documentation. This strengthens the introduction's technical foundation."
    },
    {
        "role": "user",
        "content": "Include a statement about the potential benefits: improved patient outcomes, reduced costs, and increased accessibility to quality healthcare."
    },
    {
        "role": "assistant",
        "content": "I'll emphasize the potential benefits of AI in healthcare: improved patient outcomes, cost reduction, and increased accessibility. These benefits highlight the significance of the research topic and its real-world impact."
    }
]
```

**Test Steps**:
```python
from services.memory_service import generate_conversation_summary, calculate_target_word_count

# Test target word count calculation
min_words, max_words = calculate_target_word_count(1)
print(f"Version 1 target: {min_words}-{max_words} words")
assert min_words == 100
assert max_words == 150

# Generate first-time summary
summary = generate_conversation_summary(
    messages=conversation_messages,
    previous_summary=None,
    summary_version=1
)

print(f"\nGenerated Summary (Version 1):\n{summary}\n")
print(f"Summary length: {len(summary)} characters")
word_count = len(summary.split())
print(f"Word count: {word_count}")

# Verify word count
assert word_count >= min_words * 0.7, f"Summary should be at least {min_words * 0.7} words"
assert word_count <= max_words * 1.5, f"Summary should not exceed {max_words * 1.5} words"

# Verify content quality
assert len(summary) > 0, "Summary should not be empty"
assert "AI" in summary or "artificial intelligence" in summary.lower() or "healthcare" in summary.lower(), "Should mention main topics"
assert "introduction" in summary.lower() or "paper" in summary.lower(), "Should mention the paper"

print("✓ First-time summary generated correctly")
```

**Expected Result**: Summary is 100-150 words and captures main topics

---

### Test 5.2: Progressive Summary Word Counts

**Objective**: Verify progressive word count scaling

**Steps**:
```python
from services.memory_service import (
    generate_conversation_summary,
    calculate_target_word_count
)

# Version 2: 200-250 words
min_words_v2, max_words_v2 = calculate_target_word_count(2)
assert min_words_v2 == 200
assert max_words_v2 == 250

summary_v1 = "User started writing a research paper about AI in healthcare. The introduction was created covering diagnostic tools, predictive analytics, and personalized treatment."

new_messages_v2 = [
    {
        "role": "user",
        "content": "Now I need a literature review section. Focus on recent papers about deep learning in medical imaging from the last 5 years."
    },
    {
        "role": "assistant",
        "content": "I'll create a comprehensive literature review section covering recent deep learning applications in medical imaging, focusing on papers from 2019-2024. This will include key methodologies and findings."
    }
]

summary_v2 = generate_conversation_summary(
    messages=new_messages_v2,
    previous_summary=summary_v1,
    summary_version=2
)

word_count_v2 = len(summary_v2.split())
print(f"\nVersion 2 Summary:\n{summary_v2}\n")
print(f"Version 2 word count: {word_count_v2} (target: {min_words_v2}-{max_words_v2})")

assert word_count_v2 >= min_words_v2 * 0.7, "Version 2 should be longer"
assert word_count_v2 > len(summary_v1.split()), "Version 2 should be longer than v1"

# Version 3: 300-350 words
min_words_v3, max_words_v3 = calculate_target_word_count(3)
summary_v3 = generate_conversation_summary(
    messages=new_messages_v2,
    previous_summary=summary_v2,
    summary_version=3
)

word_count_v3 = len(summary_v3.split())
print(f"\nVersion 3 word count: {word_count_v3} (target: {min_words_v3}-{max_words_v3})")
assert word_count_v3 >= min_words_v3 * 0.7, "Version 3 should be longer"

# Version 5+: Should cap at 500-750
min_words_v5, max_words_v5 = calculate_target_word_count(5)
assert min_words_v5 == 500
assert max_words_v5 == 750

summary_v5 = generate_conversation_summary(
    messages=new_messages_v2,
    previous_summary=summary_v3,
    summary_version=5
)

word_count_v5 = len(summary_v5.split())
print(f"\nVersion 5 word count: {word_count_v5} (target: {min_words_v5}-{max_words_v5})")
assert word_count_v5 <= max_words_v5 * 1.2, "Version 5 should not exceed cap significantly"

print("✓ Progressive word counts working correctly")
```

**Expected Result**: Word counts scale progressively with version

---

### Test 5.3: Incremental Summarization

**Objective**: Verify incremental summarization (old summary + new messages)

**Steps**:
```python
from services.memory_service import generate_conversation_summary

# Previous summary (from earlier in conversation)
old_summary = "The user is writing a research paper about artificial intelligence in healthcare. They started with an introduction covering diagnostic tools, predictive analytics, and personalized treatment. The paper emphasizes ML algorithms for medical imaging and NLP for clinical notes."

# New messages to incorporate
new_messages = [
    {
        "role": "user",
        "content": "I've decided to add a section on ethical considerations in AI healthcare applications. This should cover privacy concerns, algorithmic bias, and informed consent."
    },
    {
        "role": "assistant",
        "content": "I'll add a section on ethical considerations covering privacy concerns in healthcare AI, algorithmic bias in diagnostic tools, and the importance of informed consent when using AI-powered medical systems."
    },
    {
        "role": "user",
        "content": "Also include a discussion about regulatory frameworks like FDA guidelines for AI medical devices."
    },
    {
        "role": "assistant",
        "content": "I'll incorporate information about regulatory frameworks, particularly FDA guidelines for AI-powered medical devices, to provide a comprehensive view of the ethical and regulatory landscape."
    }
]

# Generate incremental summary
updated_summary = generate_conversation_summary(
    messages=new_messages,
    previous_summary=old_summary,
    summary_version=2
)

print(f"\nPrevious Summary:\n{old_summary}\n")
print(f"\nUpdated Summary (Version 2):\n{updated_summary}\n")

# Verify old context is preserved
assert "healthcare" in updated_summary.lower() or "AI" in updated_summary, "Should preserve old context"
assert "introduction" in updated_summary.lower() or "diagnostic" in updated_summary.lower(), "Should preserve old topics"

# Verify new content is incorporated
assert "ethical" in updated_summary.lower() or "ethics" in updated_summary.lower(), "Should include new ethical topic"
assert "privacy" in updated_summary.lower() or "bias" in updated_summary.lower(), "Should include new subtopics"

# Verify length increased
assert len(updated_summary) > len(old_summary), "Updated summary should be longer"

print("✓ Incremental summarization working correctly")
```

**Expected Result**: Updated summary preserves old context and incorporates new messages

---

### Test 5.4: Summary Quality and Coherence

**Objective**: Verify summary quality (readability, coherence)

**Steps**:
```python
from services.memory_service import generate_conversation_summary

# Test with longer conversation
long_conversation = [
    {
        "role": "user",
        "content": "I'm researching the impact of climate change on agricultural productivity. My paper will focus on three main regions: North America, Southeast Asia, and Sub-Saharan Africa."
    },
    {
        "role": "assistant",
        "content": "I'll help you research and write about climate change impacts on agriculture in those three regions. Let's start by examining temperature and precipitation changes in each region."
    },
    {
        "role": "user",
        "content": "For North America, I want to analyze corn and wheat yields. In Southeast Asia, focus on rice production. For Sub-Saharan Africa, examine maize and cassava."
    },
    {
        "role": "assistant",
        "content": "I'll structure the analysis by region and crop: corn and wheat in North America, rice in Southeast Asia, and maize and cassava in Sub-Saharan Africa. This will provide a comprehensive view."
    },
    {
        "role": "user",
        "content": "Include data from the last 20 years and project future trends using climate models."
    },
    {
        "role": "assistant",
        "content": "I'll incorporate historical data from 2004-2024 and use climate projection models to forecast future agricultural productivity under different emission scenarios."
    },
    {
        "role": "user",
        "content": "Discuss adaptation strategies: drought-resistant crops, improved irrigation, and shifts in planting seasons."
    },
    {
        "role": "assistant",
        "content": "I'll add a section on adaptation strategies including development of drought-resistant crop varieties, improved irrigation infrastructure, and adjusting planting calendars to optimize yields."
    }
]

summary = generate_conversation_summary(
    messages=long_conversation,
    previous_summary=None,
    summary_version=1
)

print(f"Quality Test Summary:\n{summary}\n")

# Quality checks
assert len(summary) > 0, "Summary should not be empty"
assert summary.count('.') >= 3, "Should have multiple sentences (coherence)"
assert any(region in summary for region in ["North America", "Southeast Asia", "Sub-Saharan", "Africa"]), "Should mention regions"
assert any(crop in summary for crop in ["corn", "wheat", "rice", "maize", "cassava"]) or "crop" in summary.lower(), "Should mention crops"

# Check for complete sentences (not just fragments)
sentences = summary.split('.')
complete_sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
assert len(complete_sentences) >= 3, "Should have complete, coherent sentences"

print("✓ Summary quality verified")
```

**Expected Result**: Summary is coherent, complete, and readable

---

## Integration Tests

### Test I.1: Complete Flow - First Summarization

**Objective**: Test complete flow from threshold detection to summarization

**Steps**:
```python
from models.database import ChatSessionModel
from services.memory_service import (
    should_summarize,
    determine_keep_window,
    get_messages_to_summarize,
    extract_important_data,
    generate_conversation_summary
)

# Create session and add messages
session_id = ChatSessionModel.create_session(user_id, project_id)
ChatSessionModel.initialize_memory_compression(session_id)

# Add many messages (simulate long conversation)
messages_to_add = []
for i in range(25):
    role = "user" if i % 2 == 0 else "assistant"
    content = f"Message {i}: " + "This is a detailed message with substantial content. " * 30
    messages_to_add.append({"role": role, "content": content})
    ChatSessionModel.add_message(session_id, role, content)

# Get all messages
all_messages = ChatSessionModel.get_messages(session_id)
print(f"Total messages: {len(all_messages)}")

# Check if summarization needed (only count messages)
should_sum = should_summarize(all_messages)
print(f"Should summarize: {should_sum}")

if should_sum:
    # Determine keep window
    system_prompt = "You are a helpful research assistant."
    memory = ChatSessionModel.get_memory_compression(session_id)
    keep_window, keep_indices = determine_keep_window(
        messages=all_messages,
        system_prompt=system_prompt,
        conversation_summary=memory.get('conversation_summary'),
        important_data=memory.get('important_data')
    )
    
    print(f"Keep window: {len(keep_window)} messages")
    
    # Get messages to summarize
    to_summarize = get_messages_to_summarize(all_messages, keep_indices)
    print(f"Messages to summarize: {len(to_summarize)}")
    
    # Extract important data
    important_data_new = extract_important_data(to_summarize)
    print(f"Extracted important data keys: {list(important_data_new.keys())}")
    
    # Generate summary
    summary_new = generate_conversation_summary(
        messages=to_summarize,
        previous_summary=None,
        summary_version=1
    )
    print(f"Generated summary length: {len(summary_new)} characters")
    print(f"Generated summary words: {len(summary_new.split())}")
    
    # Update memory compression
    from datetime import datetime
    updated_memory = {
        "important_data": important_data_new,
        "conversation_summary": summary_new,
        "summary_version": 1,
        "last_summarized_at": datetime.utcnow().isoformat(),
        "messages_summarized_count": len(to_summarize),
        "last_keep_window_index": keep_indices[0] if keep_indices else 0
    }
    
    ChatSessionModel.update_memory_compression(session_id, updated_memory)
    
    # Verify update
    updated = ChatSessionModel.get_memory_compression(session_id)
    assert updated['summary_version'] == 1
    assert len(updated['conversation_summary']) > 0
    assert updated['messages_summarized_count'] == len(to_summarize)
    
    print("✓ First summarization flow completed successfully")

print("✓ Integration test passed")
```

**Expected Result**: Complete flow works end-to-end

---

### Test I.2: Complete Flow - Incremental Summarization

**Objective**: Test incremental summarization flow

**Steps**:
```python
from datetime import datetime
from models.database import ChatSessionModel
from services.memory_service import (
    should_summarize,
    determine_keep_window,
    get_messages_since_last_summary,
    extract_important_data,
    generate_conversation_summary,
    merge_important_data
)

# Continue with session from Test I.1
# Add more messages
for i in range(25, 40):
    role = "user" if i % 2 == 0 else "assistant"
    content = f"Message {i}: " + "New content added to conversation. " * 30
    ChatSessionModel.add_message(session_id, role, content)

# Get all messages and existing memory
all_messages = ChatSessionModel.get_messages(session_id)
memory = ChatSessionModel.get_memory_compression(session_id)

print(f"Total messages: {len(all_messages)}")
print(f"Previous summary version: {memory['summary_version']}")

# Check if summarization needed
should_sum = should_summarize(all_messages)
print(f"Should summarize: {should_sum}")

if should_sum:
    # Determine new keep window
    system_prompt = "You are a helpful research assistant."
    keep_window, keep_indices = determine_keep_window(
        messages=all_messages,
        system_prompt=system_prompt,
        conversation_summary=memory.get('conversation_summary'),
        important_data=memory.get('important_data')
    )
    
    print(f"New keep window: {len(keep_window)} messages")
    
    # Get messages since last summary (for incremental summarization)
    messages_since = get_messages_since_last_summary(
        all_messages,
        memory['last_keep_window_index']
    )
    print(f"Messages since last summary: {len(messages_since)}")
    
    # Extract new important data
    important_data_new = extract_important_data(messages_since)
    
    # Merge with existing
    merged_important_data = merge_important_data(
        memory['important_data'],
        important_data_new
    )
    
    # Generate new summary (incremental)
    new_version = memory['summary_version'] + 1
    summary_new = generate_conversation_summary(
        messages=messages_since,
        previous_summary=memory['conversation_summary'],
        summary_version=new_version
    )
    
    print(f"New summary version: {new_version}")
    print(f"New summary words: {len(summary_new.split())}")
    
    # Verify summary grew
    assert len(summary_new.split()) > len(memory['conversation_summary'].split()), "Summary should grow"
    
    # Update memory compression
    from datetime import datetime
    updated_memory = {
        "important_data": merged_important_data,
        "conversation_summary": summary_new,
        "summary_version": new_version,
        "last_summarized_at": datetime.utcnow().isoformat(),
        "messages_summarized_count": memory['messages_summarized_count'] + len(messages_since),
        "last_keep_window_index": keep_indices[0] if keep_indices else 0
    }
    
    ChatSessionModel.update_memory_compression(session_id, updated_memory)
    
    print("✓ Incremental summarization flow completed successfully")

print("✓ Integration test passed")
```

**Expected Result**: Incremental summarization works correctly

---

## End-to-End Flow Tests

### Test E2E.1: Real Conversation Flow with AI

**Objective**: Test with real AI interactions and verify important data extraction

**Sample Conversation**:

1. **User**: "I'm writing a research paper about the applications of machine learning in financial fraud detection. Can you help me structure the paper?"

2. **User**: "I prefer APA style formatting, and I want to use Times New Roman font, size 12."

3. **User**: "The paper should have these sections: Abstract, Introduction, Literature Review, Methodology, Results and Analysis, Discussion, and Conclusion."

4. **User**: "Here are some key sources I want to cite: https://arxiv.org/abs/1907.10652 (Deep Learning for Fraud Detection), https://www.sciencedirect.com/science/article/pii/S0950705120300128 (Machine Learning in Finance), and https://ieeexplore.ieee.org/document/1234567 (Credit Card Fraud Detection)"

5. **User**: "The main contribution of this paper is a novel ensemble method combining Random Forest, XGBoost, and Neural Networks for fraud detection."

6. **User**: "I want to emphasize that the proposed method achieves 98.5% accuracy on the test dataset, which is 3% higher than existing methods."

**Test Steps**:
```python
# Simulate conversation by creating messages
conversation_flow = [
    {
        "role": "user",
        "content": "I'm writing a research paper about the applications of machine learning in financial fraud detection. Can you help me structure the paper?"
    },
    {
        "role": "assistant",
        "content": "I'll help you structure your research paper on ML applications in financial fraud detection. Let me create an outline with all the sections you need."
    },
    {
        "role": "user",
        "content": "I prefer APA style formatting, and I want to use Times New Roman font, size 12."
    },
    {
        "role": "assistant",
        "content": "I'll format your paper using APA style with Times New Roman font, size 12. All citations and references will follow APA guidelines."
    },
    {
        "role": "user",
        "content": "The paper should have these sections: Abstract, Introduction, Literature Review, Methodology, Results and Analysis, Discussion, and Conclusion."
    },
    {
        "role": "assistant",
        "content": "Perfect! I'll structure your paper with those sections: Abstract, Introduction, Literature Review, Methodology, Results and Analysis, Discussion, and Conclusion."
    },
    {
        "role": "user",
        "content": "Here are some key sources I want to cite: https://arxiv.org/abs/1907.10652 (Deep Learning for Fraud Detection), https://www.sciencedirect.com/science/article/pii/S0950705120300128 (Machine Learning in Finance), and https://ieeexplore.ieee.org/document/1234567 (Credit Card Fraud Detection)"
    },
    {
        "role": "assistant",
        "content": "I'll include citations for those papers in your references section: the arxiv paper on deep learning for fraud detection, the ScienceDirect paper on ML in finance, and the IEEE paper on credit card fraud detection."
    },
    {
        "role": "user",
        "content": "The main contribution of this paper is a novel ensemble method combining Random Forest, XGBoost, and Neural Networks for fraud detection."
    },
    {
        "role": "assistant",
        "content": "I'll highlight your main contribution - the novel ensemble method combining Random Forest, XGBoost, and Neural Networks - in the introduction and methodology sections."
    },
    {
        "role": "user",
        "content": "I want to emphasize that the proposed method achieves 98.5% accuracy on the test dataset, which is 3% higher than existing methods."
    },
    {
        "role": "assistant",
        "content": "I'll emphasize the 98.5% accuracy result and the 3% improvement over existing methods in the Results and Analysis section."
    }
]

# Test important data extraction
important_data = extract_important_data(conversation_flow)

print("\n=== Important Data Extraction Test ===\n")
print(json.dumps(important_data, indent=2))

# Verify all expected fields are extracted
assert important_data['user_preferences'].get('style') == 'APA' or 'APA' in str(important_data['user_preferences']).upper()
assert 'Times New Roman' in str(important_data['user_preferences']) or 'font' in important_data['user_preferences']
assert len(important_data['source_urls']) >= 3, "Should extract all 3 source URLs"
assert any('1907.10652' in url for url in important_data['source_urls'])
assert any('fraud' in str(dec).lower() for dec in important_data['key_decisions']) or 'ensemble' in str(important_data['key_decisions']).lower()
assert '98.5' in str(important_data['important_facts']) or 'accuracy' in str(important_data['important_facts']).lower()

# Test summary generation
summary = generate_conversation_summary(
    messages=conversation_flow,
    previous_summary=None,
    summary_version=1
)

print(f"\n=== Summary Generation Test ===\n")
print(summary)
print(f"\nWord count: {len(summary.split())}")

# Verify summary captures key points
assert 'fraud' in summary.lower() or 'financial' in summary.lower()
assert 'paper' in summary.lower() or 'research' in summary.lower()
assert 'APA' in summary or 'formatting' in summary.lower() or 'style' in summary.lower()

print("\n✓ End-to-end flow test passed")
```

**Expected Result**: Important data and summary capture all key information

---

## Verification Checklist

After running all tests, verify:

- [ ] **Phase 1**: Token counting works for all message types and structures
- [ ] **Phase 2**: Memory compression database operations work correctly
- [ ] **Phase 3**: Threshold detection and keep window logic work correctly
- [ ] **Phase 4**: Important data extraction works and captures all expected fields
- [ ] **Phase 4**: Important data merging preserves existing data and adds new data
- [ ] **Phase 5**: Summary generation produces appropriate word counts for each version
- [ ] **Phase 5**: Incremental summarization preserves old context and adds new content
- [ ] **Integration**: Complete flows work end-to-end
- [ ] **Edge Cases**: Empty messages, minimal data, errors are handled gracefully
- [ ] **Data Integrity**: All fields are written to database correctly
- [ ] **API Calls**: GPT-4o-mini calls succeed and return valid JSON/text

---

## Notes

1. **API Costs**: Phase 4 and 5 tests use GPT-4o-mini API calls. Monitor usage.
2. **Database**: Tests create and modify database records. Use test database or clean up after.
3. **Timing**: Some tests may take time due to API calls. Allow sufficient time.
4. **Error Handling**: All functions should handle errors gracefully. Verify error messages are logged.

---

## Running Tests

To run all tests, execute:

```bash
cd backend
python -m pytest tests/ -v
```

Or run individual test files:

```bash
python test_phase_1.py
python test_phase_2.py
python test_phase_3.py
python test_phase_4.py
python test_phase_5.py
python test_integration.py
```

