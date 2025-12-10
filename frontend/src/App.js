import React, { useState, useEffect, useCallback, useRef } from 'react';
import appleIcon from './assets/apple-icon.svg';
import googleIcon from './assets/google-icon.svg';
import stitchLogo from './assets/stitch-logo.svg';
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
  const [isChatsButtonHover, setIsChatsButtonHover] = useState(false);
  const [isChatsPanelHover, setIsChatsPanelHover] = useState(false);

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

  const handleChatsHoverStart = () => {
    setIsChatsButtonHover(true);
  };

  const handleChatsHoverEnd = () => {
    setIsChatsButtonHover(false);
  };

  const handleChatsPanelHoverStart = () => {
    setIsChatsPanelHover(true);
  };

  const handleChatsPanelHoverEnd = () => {
    setIsChatsPanelHover(false);
  };

  const handleCloseChatPanel = () => {
    setIsChatsPanelOpen(false);
    setIsChatsButtonHover(false);
    setIsChatsPanelHover(false);
  };

  // Keep panel open while either hover is active; close shortly after both end
  useEffect(() => {
    if (isChatsButtonHover || isChatsPanelHover) {
      setIsChatsPanelOpen(true);
      return undefined;
    }
    const timeoutId = setTimeout(() => setIsChatsPanelOpen(false), 120);
    return () => clearTimeout(timeoutId);
  }, [isChatsButtonHover, isChatsPanelHover]);

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
    handleCloseChatPanel();
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-content">
          <div className="auth-header">
            <img src={stitchLogo} alt="Stitch" className="stitch-logo" />
            <div className="auth-header-text">
              <h1>Welcome to Stitch</h1>
              <p className="auth-subtitle">Sign In to access your dashboard</p>
            </div>
          </div>
          
          <div className="auth-social-buttons">
            <button 
              type="button" 
              className="social-button google-button"
              onClick={handleGoogleSignIn}
            >
              <img src={googleIcon} alt="" className="social-icon" />
              <span>Continue with Google</span>
            </button>
            <button 
              type="button" 
              className="social-button apple-button"
              onClick={handleAppleSignIn}
            >
              <img src={appleIcon} alt="" className="social-icon" />
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
                      <path d="M10 3.75C5.83333 3.75 2.275 6.34167 0.833333 10C2.275 13.6583 5.83333 16.25 10 16.25C14.1667 16.25 17.725 13.6583 19.1667 10C17.725 6.34167 14.1667 3.75 10 3.75ZM10 14.1667C7.7 14.1667 5.83333 12.3 5.83333 10C5.83333 7.7 7.7 5.83333 10 5.83333C12.3 5.83333 14.1667 7.7 14.1667 10C14.1667 12.3 12.3 14.1667 10 14.1667ZM10 7.5C8.61667 7.5 7.5 8.61667 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C11.3833 12.5 12.5 11.3833 12.5 10C12.5 8.61667 11.3833 7.5 10 7.5Z" fill="var(--color-text-sec)"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 2.5L17.5 17.5M8.33333 8.33333C7.89167 8.775 7.5 9.375 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C10.625 12.5 11.225 12.1083 11.6667 11.6667M5.83333 5.83333C4.25 7.08333 3.125 8.45833 2.5 10C3.94167 13.6583 7.5 16.25 11.6667 16.25C12.9167 16.25 14.0833 15.9167 15.0833 15.4167L11.6667 12M2.5 10C3.94167 6.34167 7.5 3.75 11.6667 3.75C13.0833 3.75 14.375 4.16667 15.4167 4.75L12.5 7.66667" stroke="var(--color-text-sec)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
          onChatsHoverStart={handleChatsHoverStart}
          onChatsHoverEnd={handleChatsHoverEnd}
          onChatsClick={handleChatsHoverStart}
          onLogout={handleLogout}
          currentProjectName={currentProjectName}
          onChangeProject={handleChangeProject}
          isChatActive={isChatsPanelOpen}
        />
        <ChatSessionsPanel
          isOpen={isChatsPanelOpen}
          onClose={handleCloseChatPanel}
          onSelectSession={handleSwitchSession}
          currentSessionId={currentSessionId}
          isNewChat={isNewChat}
          selectedProjectId={selectedProjectId}
          currentProjectName={currentProjectName}
          onHoverStart={handleChatsPanelHoverStart}
          onHoverEnd={handleChatsPanelHoverEnd}
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
              onRemoveAttachedHighlight={(highlightId) => {
                setAttachedHighlights(prev => prev.filter(h => h.id !== highlightId));
              }}
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


