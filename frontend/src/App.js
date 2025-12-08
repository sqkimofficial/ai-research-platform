import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from './services/api';
import { getToken, setToken, removeToken, setSessionId, removeSessionId } from './utils/auth';
import ChatWindow from './components/ChatWindow/ChatWindow';
import DocumentPanel from './components/DocumentPanel/DocumentPanel';
import RightPanel from './components/RightPanel/RightPanel';
import LeftSidebar from './components/LeftSidebar/LeftSidebar';
import ChatSessionsPanel from './components/LeftSidebar/ChatSessionsPanel';
import ProjectSelector from './components/ProjectSelector/ProjectSelector';
import ScrollingTextPanel from './components/ScrollingTextPanel/ScrollingTextPanel';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isNewChat, setIsNewChat] = useState(true); // Start with new chat mode
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);
  const [attachedSections, setAttachedSections] = useState([]);
  const [attachedHighlights, setAttachedHighlights] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [highlightsTabTrigger, setHighlightsTabTrigger] = useState(0);
  const [pdfTabTrigger, setPdfTabTrigger] = useState(0);
  const [researchDocsTabTrigger, setResearchDocsTabTrigger] = useState(0);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState('');
  
  // Resizable panel state
  const [chatWidth, setChatWidth] = useState(50); // percentage of resizable area
  const [isResizing, setIsResizing] = useState(false);
  const mainContentRef = useRef(null);
  const rightPanelWidth = 48; // fixed width of RightPanel in px (from Figma)
  
  // Left sidebar state
  const [isChatsPanelOpen, setIsChatsPanelOpen] = useState(false);

  // Handle resize drag
  const handleMouseMove = useCallback((e) => {
    if (!isResizing || !mainContentRef.current) return;
    
    const container = mainContentRef.current;
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width - rightPanelWidth;
    const mouseX = e.clientX - containerRect.left;
    
    // Calculate percentage (clamped between 20% and 80%)
    let newPercentage = (mouseX / availableWidth) * 100;
    newPercentage = Math.max(20, Math.min(80, newPercentage));
    
    setChatWidth(newPercentage);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Add/remove global mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    // Check if user is already logged in
    const token = getToken();
    if (token) {
      setIsAuthenticated(true);
      // Start with new chat mode
      removeSessionId();
      setCurrentSessionId(null);
      setIsNewChat(true);
      // Show project selector if no project is selected
      const savedProjectId = localStorage.getItem('selectedProjectId');
      const savedProjectName = localStorage.getItem('selectedProjectName');
      if (savedProjectId) {
        setSelectedProjectId(savedProjectId);
        setCurrentProjectName(savedProjectName || '');
      } else {
        setShowProjectSelector(true);
      }
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Use email as username for now (backend expects username)
      const response = await authAPI.login(email, password);
      setToken(response.data.token);
      setIsAuthenticated(true);
      // Show project selector after login
      setShowProjectSelector(true);
    } catch (error) {
      setError(error.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Use email as username for now (backend expects username)
      await authAPI.register(email, password);
      // Auto-login after registration
      const response = await authAPI.login(email, password);
      setToken(response.data.token);
      setIsAuthenticated(true);
      // Show project selector after registration
      setShowProjectSelector(true);
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed. Please try again.');
    }
  };

  const handleGoogleSignIn = () => {
    // Placeholder for Google OAuth
    setError('Google sign-in is not yet implemented.');
  };

  const handleAppleSignIn = () => {
    // Placeholder for Apple OAuth
    setError('Apple sign-in is not yet implemented.');
  };

  const handleLogout = () => {
    removeToken();
    removeSessionId();
    localStorage.removeItem('selectedProjectId');
    localStorage.removeItem('selectedProjectName');
    setIsAuthenticated(false);
    setEmail('');
    setPassword('');
    setCurrentSessionId(null);
    setSelectedProjectId(null);
    setCurrentProjectName('');
  };

  const handleSelectProject = async (projectId, projectName) => {
    setSelectedProjectId(projectId);
    setCurrentProjectName(projectName || '');
    localStorage.setItem('selectedProjectId', projectId);
    if (projectName) {
      localStorage.setItem('selectedProjectName', projectName);
    }
    setShowProjectSelector(false);
    // Reset chat state for new project
    removeSessionId();
    setCurrentSessionId(null);
    setIsNewChat(true);
  };

  const handleChangeProject = () => {
    setShowProjectSelector(true);
  };

  const handleSelectSession = (sessionId) => {
    setSessionId(sessionId);
    setCurrentSessionId(sessionId);
    setIsNewChat(false);
  };

  const handleNewChat = (projectId = null) => {
    removeSessionId();
    setCurrentSessionId(null);
    setSelectedProjectId(projectId);
    setIsNewChat(true);
  };

  const handleSessionCreated = (sessionId) => {
    // Called when ChatWindow creates a session after first message
    setSessionId(sessionId);
    setCurrentSessionId(sessionId);
    setIsNewChat(false);
  };

  const handleChatsClick = () => {
    setIsChatsPanelOpen(true);
  };

  const handleCloseChatPanel = () => {
    setIsChatsPanelOpen(false);
  };

  const handleSwitchSession = (sessionId) => {
    if (sessionId === null) {
      // New chat requested - keep current project (the one selected at login)
      handleNewChat(selectedProjectId);
    } else {
      setSessionId(sessionId);
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
      // Project stays the same since all sessions are filtered by current project
    }
    setIsChatsPanelOpen(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-content">
          <h1>Welcome to Stitch</h1>
          <p className="auth-subtitle">Sign In to access your dashboard</p>
          
          <div className="auth-social-buttons">
            <button 
              type="button" 
              className="social-button google-button"
              onClick={handleGoogleSignIn}
            >
              <svg className="social-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H15.9564C17.1886 14.6545 17.64 12.9909 17.64 9.20454Z" fill="#4285F4"/>
                <path d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L11.0477 13.5614C10.2418 14.1014 9.21091 14.4204 9 14.4204C6.65455 14.4204 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z" fill="#34A853"/>
                <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
                <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65455 3.57955 9 3.57955Z" fill="#EA4335"/>
              </svg>
              <span>Continue with Google</span>
            </button>
            <button 
              type="button" 
              className="social-button apple-button"
              onClick={handleAppleSignIn}
            >
              <svg className="social-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.5625 5.625C13.375 5.8125 12.9375 6.0625 12.5 6.125C12.0625 5.6875 11.375 5.4375 10.6875 5.4375C9.9375 5.4375 9.25 5.75 8.75 6.25C8.25 6.75 8 7.4375 8 8.1875C8 8.9375 8.25 9.625 8.75 10.125C9.25 10.625 9.9375 10.875 10.6875 10.875C11.375 10.875 12.0625 10.625 12.5 10.1875C12.5625 10.1875 12.625 10.25 12.6875 10.25C13.0625 10.25 13.4375 10.0625 13.625 9.75C13.8125 9.4375 13.875 9.0625 13.75 8.75C13.625 8.4375 13.375 8.1875 13.0625 8.0625C12.75 7.9375 12.4375 7.9375 12.125 8.0625C12.0625 8.0625 12 8 11.9375 8C11.5 7.9375 11.0625 7.6875 10.875 7.25C10.6875 6.8125 10.75 6.3125 11.0625 5.9375C11.375 5.5625 11.875 5.4375 12.3125 5.5C12.75 5.5625 13.1875 5.8125 13.5625 5.625Z" fill="#000000"/>
                <path d="M12.5 3.5C12.5 3.5 11.5 2.5 10 2.5C8.5 2.5 7.5 3.5 7.5 3.5C7.5 3.5 6.5 2.5 5 2.5C3.5 2.5 2.5 3.5 2.5 3.5C2.5 3.5 1.5 4.5 1.5 6C1.5 7.5 2.5 8.5 2.5 8.5C2.5 8.5 3.5 9.5 5 9.5C6.5 9.5 7.5 8.5 7.5 8.5C7.5 8.5 8.5 9.5 10 9.5C11.5 9.5 12.5 8.5 12.5 8.5C12.5 8.5 13.5 7.5 13.5 6C13.5 4.5 12.5 3.5 12.5 3.5Z" fill="#000000"/>
              </svg>
              <span>Continue with Apple ID</span>
            </button>
          </div>

          <div className="auth-separator">
            <div className="separator-line"></div>
            <span className="separator-text">or</span>
            <div className="separator-line"></div>
          </div>

          <form onSubmit={isLogin ? handleLogin : handleRegister}>
            <div className="form-group">
              <label htmlFor="email">Email ID</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="password">Password</label>
                <a href="#" className="forgot-password" onClick={(e) => { e.preventDefault(); setError('Password reset is not yet implemented.'); }}>Forgot Password?</a>
              </div>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 3.75C5.83333 3.75 2.275 6.34167 0.833333 10C2.275 13.6583 5.83333 16.25 10 16.25C14.1667 16.25 17.725 13.6583 19.1667 10C17.725 6.34167 14.1667 3.75 10 3.75ZM10 14.1667C7.7 14.1667 5.83333 12.3 5.83333 10C5.83333 7.7 7.7 5.83333 10 5.83333C12.3 5.83333 14.1667 7.7 14.1667 10C14.1667 12.3 12.3 14.1667 10 14.1667ZM10 7.5C8.61667 7.5 7.5 8.61667 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C11.3833 12.5 12.5 11.3833 12.5 10C12.5 8.61667 11.3833 7.5 10 7.5Z" fill="#6B7280"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 2.5L17.5 17.5M8.33333 8.33333C7.89167 8.775 7.5 9.375 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C10.625 12.5 11.225 12.1083 11.6667 11.6667M5.83333 5.83333C4.25 7.08333 3.125 8.45833 2.5 10C3.94167 13.6583 7.5 16.25 11.6667 16.25C12.9167 16.25 14.0833 15.9167 15.0833 15.4167L11.6667 12M2.5 10C3.94167 6.34167 7.5 3.75 11.6667 3.75C13.0833 3.75 14.375 4.16667 15.4167 4.75L12.5 7.66667" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="sign-in-button">Sign In</button>
          </form>

          <div className="auth-footer">
            <span>Don't have an account? </span>
            <a 
              href="#" 
              className="create-account-link"
              onClick={(e) => {
                e.preventDefault();
                setIsLogin(false);
                setError('');
              }}
            >
              Create Account
            </a>
          </div>
        </div>
        <ScrollingTextPanel />
      </div>
    );
  }

  // Show project selector modal if needed
  if (showProjectSelector) {
    return (
      <ProjectSelector
        onSelectProject={handleSelectProject}
        onClose={selectedProjectId ? () => setShowProjectSelector(false) : null}
        isRequired={!selectedProjectId}
      />
    );
  }

  // Show chat interface directly (no homepage)
  return (
    <div className="app">
      <div className="app-body">
        <LeftSidebar 
          onChatsClick={handleChatsClick}
          onLogout={handleLogout}
          currentProjectName={currentProjectName}
          onChangeProject={handleChangeProject}
        />
        <ChatSessionsPanel
          isOpen={isChatsPanelOpen}
          onClose={handleCloseChatPanel}
          onSelectSession={handleSwitchSession}
          currentSessionId={currentSessionId}
          isNewChat={isNewChat}
          selectedProjectId={selectedProjectId}
          currentProjectName={currentProjectName}
        />
        <div className="main-content" ref={mainContentRef}>
          <div 
            className="chat-section"
            style={{ width: `calc(${chatWidth}% - ${rightPanelWidth * chatWidth / 100}px)` }}
          >
            <ChatWindow 
              sessionId={currentSessionId}
              isNewChat={isNewChat}
              selectedProjectId={selectedProjectId}
              onSessionCreated={handleSessionCreated}
              activeDocumentId={activeDocumentId}
              onAIMessage={(message) => {
                setDocumentRefreshTrigger(prev => prev + 1);
              }}
              attachedSections={attachedSections}
              attachedHighlights={attachedHighlights}
              onClearAttachedHighlights={() => setAttachedHighlights([])}
            />
          </div>
          <div 
            className={`resize-divider ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDown}
          >
            <div className="resize-handle" />
          </div>
          <div 
            className="document-section"
            style={{ width: `calc(${100 - chatWidth}% - ${rightPanelWidth * (100 - chatWidth) / 100}px)` }}
          >
            <DocumentPanel 
              refreshTrigger={documentRefreshTrigger}
              selectedProjectId={selectedProjectId}
              currentProjectName={currentProjectName}
              onAttachSections={(sections) => {
                setAttachedSections(sections);
              }}
              onAttachHighlight={(highlight) => {
                setAttachedHighlights(prev => {
                  // Avoid duplicates
                  const exists = prev.some(h => h.id === highlight.id);
                  if (exists) return prev;
                  return [...prev, highlight];
                });
              }}
              onActiveDocumentChange={(documentId) => {
                setActiveDocumentId(documentId);
              }}
              highlightsTabTrigger={highlightsTabTrigger}
              pdfTabTrigger={pdfTabTrigger}
              researchDocsTabTrigger={researchDocsTabTrigger}
            />
          </div>
          <RightPanel 
            onHighlightsClick={() => setHighlightsTabTrigger(prev => prev + 1)}
            onPDFsClick={() => setPdfTabTrigger(prev => prev + 1)}
            onResearchDocsClick={() => setResearchDocsTabTrigger(prev => prev + 1)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;


