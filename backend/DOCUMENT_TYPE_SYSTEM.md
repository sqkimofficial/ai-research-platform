# Document Type System

## Overview

The document type system allows the AI to dynamically create and use structured document element types. This enables granular selection and attachment of document parts (sections, paragraphs, tables, code snippets, etc.) similar to how Cursor handles code snippets.

## Architecture

### Database Schema

**Collection: `document_types`**
- `type_id`: Unique identifier
- `type_name`: Unique name (e.g., "section", "code_block", "equation")
- `description`: Human-readable description
- `metadata_schema`: JSON schema defining expected metadata fields
- `is_system`: Boolean indicating if type is a system type (cannot be deleted)
- `usage_count`: Counter for how often the type is used
- `created_at`: Timestamp
- `updated_at`: Timestamp

### Default Types

The system initializes with these default types:
- `section`: Main section heading (##)
- `subsection`: Subsection heading (###)
- `paragraph`: Regular paragraph text
- `table`: Markdown table
- `code_block`: Code snippet with syntax highlighting
- `image`: Image with optional caption
- `list`: Ordered or unordered list
- `blockquote`: Blockquote for citations
- `heading`: Generic heading (any level)

## Function Calling

The AI can create new types using the `create_document_type` function:

```json
{
  "name": "create_document_type",
  "description": "Create a new document element type",
  "parameters": {
    "type": "object",
    "properties": {
      "type_name": {
        "type": "string",
        "description": "Unique name (lowercase, underscore-separated)"
      },
      "description": {
        "type": "string",
        "description": "Human-readable description"
      },
      "metadata_schema": {
        "type": "object",
        "description": "JSON schema for metadata fields"
      }
    },
    "required": ["type_name", "description"]
  }
}
```

## Document Structure Format

When the AI adds content to a document, it must provide both:
1. `document_content`: The markdown content
2. `document_structure`: Array of structured elements

Each element in `document_structure` has:
```json
{
  "id": "unique-id",
  "type": "type_name",
  "content": "markdown content",
  "parent_id": "parent-id or null",
  "metadata": {}
}
```

### Example

```json
{
  "message": "I've added a methodology section",
  "document_content": "## Methodology\n\nThis study employs...",
  "document_structure": [
    {
      "id": "sec-methodology",
      "type": "section",
      "content": "## Methodology",
      "parent_id": null,
      "metadata": {"title": "Methodology", "level": 2}
    },
    {
      "id": "para-methodology-1",
      "type": "paragraph",
      "content": "This study employs...",
      "parent_id": "sec-methodology",
      "metadata": {}
    }
  ],
  "sources": []
}
```

## Usage Flow

1. **Initialization**: On server start, default types are initialized if they don't exist
2. **Type Creation**: AI can create new types via function calling when needed
3. **Type Usage**: AI uses available types when structuring document content
4. **Type Tracking**: Usage counts are incremented for analytics

## API Endpoints

### Chat Endpoint (`/api/chat/message`)

Returns:
```json
{
  "response": "chat message",
  "document_content": "markdown content",
  "document_structure": [...],
  "sources": [...],
  "function_calls": [...]
}
```

## Initialization

To initialize default types:

```bash
python backend/utils/init_document_types.py
```

Or types are automatically initialized on first import of the chat route.

## Database Setup

Run the MongoDB setup script to create the `document_types` collection:

```bash
mongosh "your-connection-string" < backend/setup_mongodb.js
```

## Future Enhancements

- Type validation against metadata schemas
- Type versioning
- Type deprecation
- Admin UI for managing types
- Type usage analytics dashboard

