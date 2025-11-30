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
  getAllSessions: () => {
    return api.get('/api/chat/session');
  },
  sendMessage: (sessionId, message, attachedSections = []) => {
    return api.post('/api/chat/message', { 
      session_id: sessionId, 
      message,
      attached_sections: attachedSections
    });
  },
  approveContent: (sessionId, pendingContentId, editedContent = null) => {
    return api.post('/api/chat/approve', {
      session_id: sessionId,
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
  getDocument: (sessionId) => {
    return api.get(`/api/document?session_id=${sessionId}`);
  },
  saveDocument: (sessionId, content, mode = 'replace') => {
    return api.post('/api/document', { session_id: sessionId, content, mode });
  },
  downloadPDF: (sessionId) => {
    return api.get(`/api/document/pdf?session_id=${sessionId}`, {
      responseType: 'blob'
    });
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

export default api;


