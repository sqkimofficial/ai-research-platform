// JWT token management utilities

export const setToken = (token) => {
  localStorage.setItem('token', token);
};

export const getToken = () => {
  return localStorage.getItem('token');
};

export const removeToken = () => {
  localStorage.removeItem('token');
};

export const setSessionId = (sessionId) => {
  localStorage.setItem('session_id', sessionId);
};

export const getSessionId = () => {
  return localStorage.getItem('session_id');
};

export const removeSessionId = () => {
  localStorage.removeItem('session_id');
};


