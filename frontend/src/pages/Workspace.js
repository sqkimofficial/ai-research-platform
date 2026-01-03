import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { removeToken, removeSessionId, setSessionId } from '../utils/auth';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import DocumentPanel from '../components/DocumentPanel/DocumentPanel';
import LeftSidebar from '../components/LeftSidebar/LeftSidebar';
import ChatSessionsPanel from '../components/LeftSidebar/ChatSessionsPanel';
import ProjectSelector from '../components/ProjectSelector/ProjectSelector';
import '../App.css';

const Workspace = () => {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [currentSessionId, setCurrentSessionId] = useState(sessionId || null);
  const [isNewChat, setIsNewChat] = useState(!sessionId);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || null);
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);
  const [attachedSections, setAttachedSections] = useState([]);
  const [attachedHighlights, setAttachedHighlights] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [highlightsTabTrigger, setHighlightsTabTrigger] = useState(0);
  const [pdfTabTrigger, setPdfTabTrigger] = useState(0);
  const [researchDocsTabTrigger, setResearchDocsTabTrigger] = useState(0);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState('');
  
  // Tab data from DocumentPanel
  const [tabData, setTabData] = useState({
    tabOrder: [],
    documents: [],
    highlightsTabs: [],
    pdfTabs: [],
    researchDocsTabs: [],
    activeTabType: 'document',
    activeTabId: null,
    activeDocumentId: null,
    onTabClick: null,
    onCloseTab: null,
    onAddDocument: null,
    getFaviconUrl: null
  });
  
  // Editor methods for cursor-aware content insertion
  const editorMethodsRef = useRef(null);
  
  // Resizable panel state
  const [chatWidth, setChatWidth] = useState(30);
  const [isResizing, setIsResizing] = useState(false);
  const mainContentRef = useRef(null);
  
  // Left sidebar state
  const [isChatsPanelOpen, setIsChatsPanelOpen] = useState(false);
  const [isChatsButtonHover, setIsChatsButtonHover] = useState(false);
  const [isChatsPanelHover, setIsChatsPanelHover] = useState(false);

  // Handle resize drag
  const handleMouseMove = useCallback((e) => {
    if (!isResizing || !mainContentRef.current) return;
    
    const container = mainContentRef.current;
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;
    
    // Calculate document width percentage (left side)
    let documentPercentage = (mouseX / availableWidth) * 100;
    documentPercentage = Math.max(20, Math.min(80, documentPercentage));
    
    // Chat width is the remainder (right side)
    const chatPercentage = 100 - documentPercentage;
    setChatWidth(chatPercentage);
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

  // Initialize project and session from URL params
  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
      const savedProjectName = localStorage.getItem('selectedProjectName');
      if (savedProjectName) {
        setCurrentProjectName(savedProjectName);
      }
    } else {
      // No project ID in URL (e.g., /workspace route) - check localStorage or show selector
      const savedProjectId = localStorage.getItem('selectedProjectId');
      const savedProjectName = localStorage.getItem('selectedProjectName');
      if (savedProjectId) {
        // Redirect to workspace with project ID
        const currentSessionId = sessionId || null;
        if (currentSessionId) {
          navigate(`/project/${savedProjectId}/workspace/${currentSessionId}`, { replace: true });
        } else {
          navigate(`/project/${savedProjectId}/workspace`, { replace: true });
        }
      } else {
        setShowProjectSelector(true);
      }
    }

    if (sessionId) {
      setCurrentSessionId(sessionId);
      setSessionId(sessionId);
      setIsNewChat(false);
    } else {
      removeSessionId();
      setCurrentSessionId(null);
      setIsNewChat(true);
    }
  }, [projectId, sessionId, navigate]);

  // Sync URL when session changes
  useEffect(() => {
    if (selectedProjectId) {
      if (currentSessionId && currentSessionId !== sessionId) {
        // Session changed - update URL
        navigate(`/project/${selectedProjectId}/workspace/${currentSessionId}`, { replace: true });
      } else if (!currentSessionId && sessionId) {
        // Session cleared - remove from URL
        navigate(`/project/${selectedProjectId}/workspace`, { replace: true });
      }
    }
  }, [currentSessionId, selectedProjectId, sessionId, navigate]);

  const handleLogout = () => {
    removeToken();
    removeSessionId();
    localStorage.removeItem('selectedProjectId');
    localStorage.removeItem('selectedProjectName');
    navigate('/login/email');
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
    // Navigate to workspace with new project
    navigate(`/project/${projectId}/workspace`, { replace: true });
  };

  const handleChangeProject = (projectId, projectName) => {
    if (projectId && projectName) {
      handleSelectProject(projectId, projectName);
    } else {
      setShowProjectSelector(true);
    }
  };

  const handleSessionCreated = (sessionId) => {
    setSessionId(sessionId);
    setCurrentSessionId(sessionId);
    setIsNewChat(false);
    // Update URL with new session
    if (selectedProjectId) {
      navigate(`/project/${selectedProjectId}/workspace/${sessionId}`, { replace: true });
    }
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

  // Keep panel open while either hover is active
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
      // New chat requested
      removeSessionId();
      setCurrentSessionId(null);
      setIsNewChat(true);
      if (selectedProjectId) {
        navigate(`/project/${selectedProjectId}/workspace`, { replace: true });
      }
    } else {
      setSessionId(sessionId);
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
      if (selectedProjectId) {
        navigate(`/project/${selectedProjectId}/workspace/${sessionId}`, { replace: true });
      }
    }
    handleCloseChatPanel();
  };

  const handleEditorReady = useCallback((editorMethods) => {
    editorMethodsRef.current = editorMethods;
  }, []);

  const handleInsertContentAtCursor = useCallback((htmlContent) => {
    if (editorMethodsRef.current?.insertContentAtCursor) {
      return editorMethodsRef.current.insertContentAtCursor(htmlContent);
    }
    return false;
  }, []);

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

  // Show workspace
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
          onHighlightsClick={() => setHighlightsTabTrigger(prev => prev + 1)}
          onPDFsClick={() => setPdfTabTrigger(prev => prev + 1)}
          onResearchDocsClick={() => setResearchDocsTabTrigger(prev => prev + 1)}
          tabOrder={tabData.tabOrder}
          documents={tabData.documents}
          highlightsTabs={tabData.highlightsTabs}
          pdfTabs={tabData.pdfTabs}
          researchDocsTabs={tabData.researchDocsTabs}
          activeTabType={tabData.activeTabType}
          activeTabId={tabData.activeTabId}
          activeDocumentId={tabData.activeDocumentId}
          onTabClick={tabData.onTabClick}
          onCloseTab={tabData.onCloseTab}
          onAddDocument={tabData.onAddDocument}
          getFaviconUrl={tabData.getFaviconUrl}
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
            className="document-section"
            style={{ width: `${100 - chatWidth}%` }}
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
              onEditorReady={handleEditorReady}
              onTabDataChange={setTabData}
            />
          </div>
          <div 
            className={`resize-divider ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDown}
          >
            <div className="resize-handle" />
          </div>
          <div 
            className="chat-section"
            style={{ width: `${chatWidth}%` }}
          >
            <ChatWindow 
              sessionId={currentSessionId}
              isNewChat={isNewChat}
              selectedProjectId={selectedProjectId}
              onSessionCreated={handleSessionCreated}
              onSwitchSession={handleSwitchSession}
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
              onInsertContentAtCursor={handleInsertContentAtCursor}
              onActiveDocumentChange={(documentId) => {
                setActiveDocumentId(documentId);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Workspace;

