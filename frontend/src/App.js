import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from './services/api';
import { getToken, setToken, removeToken, setSessionId, removeSessionId } from './utils/auth';
import ChatWindow from './components/ChatWindow/ChatWindow';
import DocumentPanel from './components/DocumentPanel/DocumentPanel';
import RightPanel from './components/RightPanel/RightPanel';
import LeftSidebar from './components/LeftSidebar/LeftSidebar';
import ChatSessionsPanel from './components/LeftSidebar/ChatSessionsPanel';
import ProjectSelector from './components/ProjectSelector/ProjectSelector';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isNewChat, setIsNewChat] = useState(true); // Start with new chat mode
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);
  const [attachedSections, setAttachedSections] = useState([]);
  const [attachedHighlights, setAttachedHighlights] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [highlightsTabTrigger, setHighlightsTabTrigger] = useState(0);
  const [pdfTabTrigger, setPdfTabTrigger] = useState(0);
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
      const response = await authAPI.login(username, password);
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
      await authAPI.register(username, password);
      // Auto-login after registration
      const response = await authAPI.login(username, password);
      setToken(response.data.token);
      setIsAuthenticated(true);
      // Show project selector after registration
      setShowProjectSelector(true);
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed. Please try again.');
    }
  };

  const handleLogout = () => {
    removeToken();
    removeSessionId();
    localStorage.removeItem('selectedProjectId');
    localStorage.removeItem('selectedProjectName');
    setIsAuthenticated(false);
    setUsername('');
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

  const handleSwitchSession = (sessionId, projectId, projectName) => {
    if (sessionId === null) {
      // New chat requested - keep current project (the one selected at login)
      handleNewChat(selectedProjectId);
    } else {
      setSessionId(sessionId);
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
      // Update project to match the session's project
      if (projectId) {
        setSelectedProjectId(projectId);
        setCurrentProjectName(projectName || '');
        localStorage.setItem('selectedProjectId', projectId);
        if (projectName) {
          localStorage.setItem('selectedProjectName', projectName);
        }
      }
    }
    setIsChatsPanelOpen(false);
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
            />
          </div>
          <RightPanel 
            onHighlightsClick={() => setHighlightsTabTrigger(prev => prev + 1)}
            onPDFsClick={() => setPdfTabTrigger(prev => prev + 1)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;


