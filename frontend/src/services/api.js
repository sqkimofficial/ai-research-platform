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

// Chat API
export const chatAPI = {
  createSession: () => {
    return api.post('/api/chat/session');
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

export default api;


