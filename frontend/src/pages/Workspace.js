import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { removeSessionId, setSessionId, clearAuthData } from '../utils/auth';
import useAuth0Token from '../hooks/useAuth0Token';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import DocumentPanel from '../components/DocumentPanel/DocumentPanel';
import LeftSidebar from '../components/LeftSidebar/LeftSidebar';
import ChatSessionsPanel from '../components/LeftSidebar/ChatSessionsPanel';
import ProjectSelector from '../components/ProjectSelector/ProjectSelector';
import '../App.css';

const Workspace = () => {
  // Set up Auth0 token for API calls
  useAuth0Token();
  const { logout } = useAuth0();
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [currentSessionId, setCurrentSessionId] = useState(sessionId || null);
  const [isNewChat, setIsNewChat] = useState(!sessionId);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || null);
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);
  const [documentNameRefreshTrigger, setDocumentNameRefreshTrigger] = useState(0);
  const [attachedSections, setAttachedSections] = useState([]);
  const [attachedHighlights, setAttachedHighlights] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [pdfTabTrigger, setPdfTabTrigger] = useState(0);
  const [researchDocsTabTrigger, setResearchDocsTabTrigger] = useState(0);
  const [uploadTrigger, setUploadTrigger] = useState(0);  // Trigger to auto-click upload button
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
  
  // Main content ref
  const mainContentRef = useRef(null);
  
  // Resizable panel state
  const [chatWidth, setChatWidth] = useState(30); // Default 30% of viewport
  const [isResizing, setIsResizing] = useState(false);
  
  // Chat collapsed state - default based on view context
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  
  // Track previous tab type to determine if we're navigating from a document
  const previousTabTypeRef = useRef(null);
  const previousActiveDocumentIdRef = useRef(null);
  
  // Left sidebar state
  const [isChatsPanelOpen, setIsChatsPanelOpen] = useState(false);
  const [isChatsButtonHover, setIsChatsButtonHover] = useState(false);
  const [isChatsPanelHover, setIsChatsPanelHover] = useState(false);
  
  // Determine if we're in document edit view (has activeDocumentId and activeTabType is 'document')
  const isDocumentEditView = activeDocumentId && tabData.activeTabType === 'document';
  
  // Automatically adjust chat window collapse state based on navigation
  useEffect(() => {
    const currentTabType = tabData.activeTabType;
    const currentActiveDocumentId = tabData.activeDocumentId;
    const previousTabType = previousTabTypeRef.current;
    const previousActiveDocumentId = previousActiveDocumentIdRef.current;
    
    // Skip on initial mount (when refs are null)
    if (previousTabType === null && previousActiveDocumentId === null) {
      // Initialize refs and set initial state based on current view
      previousTabTypeRef.current = currentTabType;
      previousActiveDocumentIdRef.current = currentActiveDocumentId;
      
      // Set initial collapse state
      if (currentTabType === 'document' && currentActiveDocumentId) {
        setIsChatCollapsed(false);
      } else if (currentTabType === 'pdf' || currentTabType === 'researchdocs' || currentTabType === 'highlights') {
        setIsChatCollapsed(true);
      }
      return;
    }
    
    // Only auto-adjust if tab type or active document changed (navigation occurred)
    if (currentTabType !== previousTabType || currentActiveDocumentId !== previousActiveDocumentId) {
      // Determine if we're navigating from a document
      const wasInDocument = previousTabType === 'document' && previousActiveDocumentId;
      
      // Apply auto-collapse/expand logic
      if (currentTabType === 'document' && currentActiveDocumentId) {
        // Document editor → maximize
        setIsChatCollapsed(false);
      } else if (currentTabType === 'pdf') {
        // Sources page → always minimize
        setIsChatCollapsed(true);
      } else if (currentTabType === 'researchdocs') {
        // Research documents page → minimize
        setIsChatCollapsed(true);
      } else if (currentTabType === 'highlights') {
        // Highlights page → if coming from document, stay expanded; otherwise minimize
        if (wasInDocument) {
          setIsChatCollapsed(false);
        } else {
          setIsChatCollapsed(true);
        }
      } else if (!currentActiveDocumentId && !tabData.activeTabId) {
        // New tab (no active tab) → minimize
        setIsChatCollapsed(true);
      }
      
      // Update refs for next comparison
      previousTabTypeRef.current = currentTabType;
      previousActiveDocumentIdRef.current = currentActiveDocumentId;
    }
  }, [tabData.activeTabType, tabData.activeTabId, tabData.activeDocumentId]);

  // Handle resize drag
  const handleMouseMove = useCallback((e) => {
    if (!isResizing || !mainContentRef.current) return;
    
    const container = mainContentRef.current;
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;
    
    // Calculate chat width percentage based on distance from right edge
    // mouseX is from left, so distance from right = availableWidth - mouseX
    let chatPercentage = ((availableWidth - mouseX) / availableWidth) * 100;
    chatPercentage = Math.max(20, Math.min(80, chatPercentage)); // Limit between 20% and 80%
    
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
    // Clear local auth data
    clearAuthData();
    removeSessionId();
    localStorage.removeItem('selectedProjectId');
    localStorage.removeItem('selectedProjectName');
    
    // Logout from Auth0 and redirect to login page
    logout({
      logoutParams: {
        returnTo: window.location.origin + '/login/email'
      }
    });
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

  // Handle navigation to sources with auto-upload trigger
  const handleNavigateToSources = useCallback(() => {
    // First switch to the PDF/Sources tab
    setPdfTabTrigger(prev => prev + 1);
    // Then trigger the upload button click (with a small delay to ensure tab switch completes)
    setTimeout(() => {
      setUploadTrigger(prev => prev + 1);
    }, 100);
  }, []);

  // Toggle chat collapsed state
  const handleToggleChatCollapse = useCallback(() => {
    setIsChatCollapsed(prev => !prev);
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
          onHighlightsClick={() => {}} // No-op: web highlights are now shown in PDF tab
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
          {/* Document section - width adjusts based on chat state and view context */}
          <div 
            className={`document-section ${isDocumentEditView ? 'document-edit-view' : 'list-view'} ${!isChatCollapsed ? 'chat-expanded' : ''}`}
            style={{ 
              width: isChatCollapsed ? '100%' : `${100 - chatWidth}%`,
              '--chat-width-vw': isChatCollapsed ? '0vw' : `${chatWidth}vw`
            }}
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
              onDocumentNameUpdate={() => {
                setDocumentNameRefreshTrigger(prev => prev + 1);
              }}
              highlightsTabTrigger={0}
              pdfTabTrigger={pdfTabTrigger}
              researchDocsTabTrigger={researchDocsTabTrigger}
              uploadTrigger={uploadTrigger}
              onEditorReady={handleEditorReady}
              onTabDataChange={setTabData}
              isChatCollapsed={isChatCollapsed}
            />
          </div>
          {/* Floating chat window - pushes content when expanded */}
          {!isChatCollapsed && (
            <div 
              className={`chat-floating-container ${isDocumentEditView ? 'document-edit-view' : 'list-view'}`}
              style={{ width: `${chatWidth}%` }}
            >
              {/* Resize divider - inside container, on left side */}
              <div 
                className={`resize-divider ${isResizing ? 'resizing' : ''}`}
                onMouseDown={handleMouseDown}
              >
                <div className="resize-handle" />
              </div>
              <ChatWindow 
                sessionId={currentSessionId}
                isNewChat={isNewChat}
                selectedProjectId={selectedProjectId}
                onSessionCreated={handleSessionCreated}
                onSwitchSession={handleSwitchSession}
                activeDocumentId={activeDocumentId}
                documentNameRefreshTrigger={documentNameRefreshTrigger}
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
                onNavigateToSources={handleNavigateToSources}
                isCollapsed={false}
                onToggleCollapse={handleToggleChatCollapse}
                viewContext={isDocumentEditView ? "document" : "list"}
              />
            </div>
          )}
          {/* Collapsed chat button */}
          {isChatCollapsed && (
            <ChatWindow 
              sessionId={currentSessionId}
              isNewChat={isNewChat}
              selectedProjectId={selectedProjectId}
              onSessionCreated={handleSessionCreated}
              onSwitchSession={handleSwitchSession}
              activeDocumentId={activeDocumentId}
              documentNameRefreshTrigger={documentNameRefreshTrigger}
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
              onNavigateToSources={handleNavigateToSources}
              isCollapsed={true}
              onToggleCollapse={handleToggleChatCollapse}
              viewContext={isDocumentEditView ? "document" : "list"}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Workspace;

