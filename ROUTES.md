# Application Routes & Slugs

This document maintains all URL routes/slugs for the application.

## Complete Route List

### Authentication Routes

1. **`/login/email`** - Login step 1: Email input
   - Shows social login buttons (Google, Apple)
   - Email input form
   - On submit, navigates to `/login/password` with email in state/query

2. **`/login/password`** - Login step 2: Password input
   - Password input form
   - Email is passed from previous step (via state or query param)
   - On submit, authenticates user and redirects to workspace

3. **`/register`** - User registration page
   - Email, password, and confirm password fields
   - Auto-login after successful registration
   - Redirects to project selector, then workspace

### Workspace Routes

4. **`/project/:projectId/workspace`** - Workspace without active session
   - New chat state (no session ID)
   - Shows chat window, document panel, and right panel
   - All tabs/panels available (documents, highlights, PDFs) but no active session

5. **`/project/:projectId/workspace/:sessionId`** - Workspace with active chat session
   - Loads specific chat session
   - Shows chat history, document, and all panels
   - **This is the main route for all workspace interactions**

## Route Structure Summary

```
/login/email                              → Email input step
/login/password                           → Password input step
/register                                 → Registration page
/project/:projectId/workspace             → Workspace (new chat)
/project/:projectId/workspace/:sessionId  → Workspace (active session)
```

**Total Routes: 5**

## Important Notes

### Documents, Highlights, and PDFs Are NOT Separate Routes

- Documents, highlights, and PDFs are **tabs/panels within the workspace view**
- They are managed via component state, NOT separate route slugs
- This avoids route conflicts (can't have both `/workspace/:sessionId` and `/workspace/:documentId`)
- Active document/highlight/PDF is managed via:
  - Component state
  - Optional query parameters (e.g., `?documentId=xxx` or `?tab=highlights`)

### Session IDs in URLs

- **Yes, session IDs are included in URLs** - this is standard practice (like Slack, Discord, Google Docs)
- Benefits:
  - Shareable links to specific chats
  - Browser back/forward works correctly
  - Bookmarkable sessions
  - Direct navigation to specific conversations

### Optional Query Parameters

For deep linking within the workspace (not separate routes):

- `?documentId=xxx` - Open specific document in document panel
- `?tab=highlights` - Switch to highlights tab
- `?tab=pdfs` - Switch to PDFs tab
- `?tab=research-docs` - Switch to research documents tab
- `?highlightUrl=xxx` - Open specific URL highlight (URL encoded)
- `?pdfId=xxx` - Open specific PDF

Example: `/project/abc123/workspace/sess456?documentId=doc789&tab=document`

## Route Guards & Redirects

- **Unauthenticated users** → `/login/email`
- **Authenticated users without project** → Project selector modal (no route, just modal overlay)
- **Authenticated users with project** → `/project/:projectId/workspace`
- **Invalid session ID** → Redirect to `/project/:projectId/workspace` (new chat state)
- **Invalid project ID** → Redirect to project selector

## Future Routes (Not Implemented Yet)

- `/project/:projectId` - Project overview/dashboard page
  - Future: Standalone project view
  - Currently: Workspace serves as the project view

---

**Last Updated**: 2024-12-19


