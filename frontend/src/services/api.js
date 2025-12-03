import axios from 'axios';
import { getToken } from '../utils/auth';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (username, password) => {
    return api.post('/api/auth/register', { username, password });
  },
  login: (username, password) => {
    return api.post('/api/auth/login', { username, password });
  },
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
  getAllSessions: (projectId = null) => {
    let url = '/api/chat/session';
    if (projectId) {
      url += `?project_id=${projectId}`;
    }
    return api.get(url);
  },
  sendMessage: (sessionId, message, attachedSections = []) => {
    return api.post('/api/chat/message', { 
      session_id: sessionId, 
      message,
      attached_sections: attachedSections
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
  rejectContent: (sessionId, pendingContentId) => {
    return api.post('/api/chat/reject', {
      session_id: sessionId,
      pending_content_id: pendingContentId
    });
  },
  rewriteContent: (sessionId, originalMessage) => {
    return api.post('/api/chat/rewrite', {
      session_id: sessionId,
      original_message: originalMessage
    });
  },
};

// Document API
export const documentAPI = {
  getDocument: (sessionId, documentId = null) => {
    if (documentId) {
      return api.get(`/api/document?document_id=${documentId}`);
    }
    return api.get(`/api/document?session_id=${sessionId}`);
  },
  saveDocument: (sessionId, content, mode = 'replace', documentId = null, structure = null, title = null) => {
    if (documentId) {
      return api.post('/api/document', { document_id: documentId, content, mode, structure, title });
    }
    return api.post('/api/document', { session_id: sessionId, content, mode });
  },
  downloadPDF: (sessionId) => {
    return api.get(`/api/document/pdf?session_id=${sessionId}`, {
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
};

export default api;


