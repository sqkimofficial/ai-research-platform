import axios from 'axios';
import { getToken } from '../utils/auth';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/**
 * Create axios instance for API calls
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Token getter function - will be set by Auth0TokenProvider
 * This allows us to use getAccessTokenSilently from Auth0
 */
let tokenGetter = null;

/**
 * Set the token getter function
 * Called from a component that has access to Auth0 context
 * 
 * @param {Function} getter - Function that returns a promise resolving to the token
 */
export const setTokenGetter = (getter) => {
  tokenGetter = getter;
};

/**
 * Get token from storage (checks both custom token and Auth0 cache)
 */
const getTokenFromStorage = () => {
  return getToken();
};

/**
 * Request interceptor to add token to requests
 */
api.interceptors.request.use(
  async (config) => {
    let token = null;
    
    // First try to get token from our storage (handles both custom and Auth0)
    token = getTokenFromStorage();
    
    // If no token in storage, try Auth0 SDK getter (for fresh tokens)
    if (!token && tokenGetter) {
      try {
        token = await tokenGetter();
      } catch (e) {
        console.warn('Failed to get token from Auth0 SDK:', e);
      }
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor for handling auth errors
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      // The Auth0 SDK will handle refresh, but if it fails,
      // we should redirect to login
      console.warn('Unauthorized request - token may be expired');
    }
    return Promise.reject(error);
  }
);

/**
 * Auth API
 * - Email/password login/register use our backend (which calls Auth0)
 * - Social login sync uses /api/auth/sync
 */
export const authAPI = {
  /**
   * Login with email and password
   * Backend authenticates with Auth0 and returns token
   */
  login: (email, password) => {
    return api.post('/api/auth/login', { email, password });
  },
  
  /**
   * Register with email and password
   * Backend creates user in Auth0
   */
  register: (email, password, firstName = '', lastName = '') => {
    return api.post('/api/auth/register', { 
      email, 
      password, 
      first_name: firstName,
      last_name: lastName
    });
  },
  
  /**
   * Sync user to backend after Auth0 social login
   * Called automatically by AuthCallback component
   */
  syncUser: () => {
    return api.post('/api/auth/sync');
  },
  
  /**
   * Get current user info
   */
  getCurrentUser: () => {
    return api.get('/api/auth/me');
  },
  
  /**
   * Verify token is valid
   */
  verifyToken: () => {
    return api.get('/api/auth/verify');
  }
};

// Project API
export const projectAPI = {
  createProject: (projectName, description) => {
    return api.post('/api/project', { project_name: projectName, description });
  },
  getAllProjects: () => {
    return api.get('/api/project');
  },
  getProject: (projectId) => {
    return api.get(`/api/project?project_id=${projectId}`);
  },
  updateProject: (projectId, projectName, description) => {
    return api.put('/api/project', { project_id: projectId, project_name: projectName, description });
  },
  deleteProject: (projectId) => {
    return api.delete('/api/project', { data: { project_id: projectId } });
  },
};

// Chat API
export const chatAPI = {
  createSession: (projectId) => {
    return api.post('/api/chat/session', { project_id: projectId });
  },
  getSession: (sessionId) => {
    return api.get(`/api/chat/session?session_id=${sessionId}`);
  },
  getAllSessions: (projectId = null, limit = null, skip = 0) => {
    let url = '/api/chat/session';
    const params = [];
    if (projectId) {
      params.push(`project_id=${projectId}`);
    }
    if (limit !== null) {
      params.push(`limit=${limit}`);
    }
    if (skip > 0) {
      params.push(`skip=${skip}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return api.get(url);
  },
  sendMessage: (sessionId, message, attachedSections = [], mode = 'write') => {
    return api.post('/api/chat/message', { 
      session_id: sessionId, 
      message,
      attached_sections: attachedSections,
      mode
    });
  },
  approveContent: (sessionId, pendingContentId, editedContent = null, documentId = null) => {
    return api.post('/api/chat/approve', {
      session_id: sessionId,
      document_id: documentId,
      pending_content_id: pendingContentId,
      edited_content: editedContent
    });
  },
  directInsertContent: (sessionId, pendingContentId, editedContent = null, documentId = null) => {
    // Direct insertion at cursor or end of document (no AI placement)
    return api.post('/api/chat/direct-insert', {
      session_id: sessionId,
      document_id: documentId,
      pending_content_id: pendingContentId,
      edited_content: editedContent
    });
  },
  // Clear pending content without modifying the document
  // Used when client-side insertion handles the document update
  clearPendingContent: (sessionId, pendingContentId) => {
    return api.post('/api/chat/clear-pending', {
      session_id: sessionId,
      pending_content_id: pendingContentId
    });
  },
};

// Document API
export const documentAPI = {
  getDocument: (documentId) => {
    return api.get(`/api/document?document_id=${documentId}`);
  },
  /**
   * Save document using delta patches
   * @param {string} documentId - Document ID
   * @param {string} patches - Patch text from diff-match-patch
   * @param {number} version - Current version for optimistic locking
   * @param {string} title - Optional title update
   * @param {boolean} shouldGenerateSnapshot - Whether to generate snapshot (Phase 3)
   */
  saveDocument: (documentId, patches, version, title = null, shouldGenerateSnapshot = true) => {
    return api.post('/api/document', { 
      document_id: documentId, 
      patches, 
      version,
      title,
      should_generate_snapshot: shouldGenerateSnapshot
    });
  },
  downloadPDF: (sessionId) => {
    return api.get(`/api/document/pdf?session_id=${sessionId}`, {
      responseType: 'blob'
    });
  },
  downloadResearchDocumentPDF: (documentId) => {
    return api.get(`/api/document/research-documents/${documentId}/pdf`, {
      responseType: 'blob'
    });
  },
  getAllResearchDocuments: (projectId = null) => {
    let url = '/api/document/research-documents';
    if (projectId) {
      url += `?project_id=${projectId}`;
    }
    return api.get(url);
  },
  createResearchDocument: (projectId, title = null) => {
    return api.post('/api/document/research-documents', { project_id: projectId, title });
  },
  deleteResearchDocument: (documentId) => {
    return api.delete(`/api/document/research-documents/${documentId}`);
  },
  archiveDocument: (documentId) => {
    return api.post(`/api/document/research-documents/${documentId}/archive`);
  },
  unarchiveDocument: (documentId) => {
    return api.post(`/api/document/research-documents/${documentId}/unarchive`);
  },
  renameDocument: (documentId, newTitle) => {
    return api.patch(`/api/document/research-documents/${documentId}/rename`, { title: newTitle });
  },
};

// Highlights API
export const highlightsAPI = {
  getHighlights: (projectId, sourceUrl = null) => {
    let url = `/api/highlights?project_id=${projectId}`;
    if (sourceUrl) {
      url += `&source_url=${encodeURIComponent(sourceUrl)}`;
    }
    return api.get(url);
  },
  deleteHighlight: (projectId, sourceUrl, highlightId) => {
    return api.delete('/api/highlights', {
      data: {
        project_id: projectId,
        source_url: sourceUrl,
        highlight_id: highlightId
      }
    });
  },
  // Get preview image for a web highlight
  getHighlightPreview: (highlightId, projectId, sourceUrl) => {
    return api.get(`/api/highlights/preview/${highlightId}?project_id=${projectId}&source_url=${encodeURIComponent(sourceUrl)}`);
  },
};

// Highlight Documents API (PDF, JPG, PNG)
export const pdfAPI = {
  // Upload a document file (PDF, JPG, PNG)
  uploadPDF: (projectId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    return api.post('/api/pdfs', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  // Get all documents (optionally filtered by project)
  getPDFs: (projectId = null) => {
    let url = '/api/pdfs';
    if (projectId) {
      url += `?project_id=${projectId}`;
    }
    return api.get(url);
  },
  // Get a specific document
  getPDF: (pdfId) => {
    return api.get(`/api/pdfs?pdf_id=${pdfId}`);
  },
  // Get document file URL for viewing
  getPDFFileUrl: (pdfId) => {
    const token = getToken();
    return `${API_BASE_URL}/api/pdfs/file/${pdfId}?token=${token}`;
  },
  // Get highlights for a document
  getHighlights: (pdfId) => {
    return api.get(`/api/pdfs/highlights/${pdfId}`);
  },
  // Get preview image for a specific highlight
  getHighlightPreview: (pdfId, highlightId) => {
    return api.get(`/api/pdfs/highlight-preview/${pdfId}/${highlightId}`);
  },
  // Add a highlight to a document
  addHighlight: (pdfId, text, color = 'yellow', pageNumber = null, note = null) => {
    return api.post(`/api/pdfs/highlights/${pdfId}`, {
      text,
      color,
      page_number: pageNumber,
      note
    });
  },
  // Delete a highlight from a document
  deleteHighlight: (pdfId, highlightId) => {
    return api.delete(`/api/pdfs/highlights/${pdfId}/${highlightId}`);
  },
  // Update a highlight's note
  updateHighlightNote: (pdfId, highlightId, note) => {
    return api.put(`/api/pdfs/highlights/${pdfId}/${highlightId}`, { note });
  },
  // Delete a document
  deletePDF: (pdfId) => {
    return api.delete(`/api/pdfs/${pdfId}`);
  },
  // Re-extract highlights from a document
  reextractHighlights: (pdfId) => {
    return api.post(`/api/pdfs/reextract/${pdfId}`);
  },
  // Get SSE event source URL for real-time extraction updates
  getSSEEventSourceUrl: () => {
    const token = getToken();
    return `${API_BASE_URL}/api/pdfs/events?token=${token}`;
  },
};

export default api;
