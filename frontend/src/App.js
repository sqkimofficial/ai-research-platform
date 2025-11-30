import React, { useState, useEffect } from 'react';
import { authAPI } from './services/api';
import { getToken, setToken, removeToken, setSessionId, removeSessionId } from './utils/auth';
import HomePage from './components/HomePage/HomePage';
import ChatWindow from './components/ChatWindow/ChatWindow';
import DocumentPanel from './components/DocumentPanel/DocumentPanel';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);
  const [attachedSections, setAttachedSections] = useState([]);

  useEffect(() => {
    // Check if user is already logged in
    const token = getToken();
    if (token) {
      setIsAuthenticated(true);
      // Clear any old sessionId to ensure user starts on homepage
      removeSessionId();
      setCurrentSessionId(null);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await authAPI.login(username, password);
      setToken(response.data.token);
      setIsAuthenticated(true);
    } catch (error) {
      setError(error.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await authAPI.register(username, password);
      // Auto-login after registration
      const response = await authAPI.login(username, password);
      setToken(response.data.token);
      setIsAuthenticated(true);
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed. Please try again.');
    }
  };

  const handleLogout = () => {
    removeToken();
    removeSessionId();
    setIsAuthenticated(false);
    setUsername('');
    setPassword('');
    setCurrentSessionId(null);
  };

  const handleSelectSession = (sessionId) => {
    setSessionId(sessionId);
    setCurrentSessionId(sessionId);
  };

  const handleBackToHome = () => {
    removeSessionId();
    setCurrentSessionId(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>AI Research Platform</h1>
          <div className="auth-tabs">
            <button
              className={isLogin ? 'active' : ''}
              onClick={() => {
                setIsLogin(true);
                setError('');
              }}
            >
              Login
            </button>
            <button
              className={!isLogin ? 'active' : ''}
              onClick={() => {
                setIsLogin(false);
                setError('');
              }}
            >
              Register
            </button>
          </div>
          <form onSubmit={isLogin ? handleLogin : handleRegister}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <div className="error-message">{error}</div>}
            <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
          </form>
        </div>
      </div>
    );
  }

  // Show homepage if no session is selected
  if (!currentSessionId) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>AI Research Platform</h1>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </header>
        <HomePage 
          onSelectSession={handleSelectSession}
          onCreateNewSession={handleSelectSession}
        />
      </div>
    );
  }

  // Show chat interface when a session is selected
  return (
    <div className="app">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={handleBackToHome} className="back-button">
            ← Back to Sessions
          </button>
          <h1>AI Research Platform</h1>
        </div>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </header>
      <div className="main-content">
        <div className="chat-section">
          <ChatWindow 
            sessionId={currentSessionId}
            onAIMessage={(message) => {
              setDocumentRefreshTrigger(prev => prev + 1);
            }}
            attachedSections={attachedSections}
          />
        </div>
        <div className="document-section">
          <DocumentPanel 
            refreshTrigger={documentRefreshTrigger}
            onAttachSections={(sections) => {
              setAttachedSections(sections);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;


