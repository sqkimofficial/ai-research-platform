import React, { useState, useEffect, useRef } from 'react';
import { chatAPI } from '../../services/api';
import { getSessionId, setSessionId } from '../../utils/auth';
import { markdownToHtml } from '../../utils/markdownConverter';
import MessageBubble from './MessageBubble';
import ProjectSelector from '../ProjectSelector/ProjectSelector';
import './ChatWindow.css';
import { ReactComponent as WriteIcon } from '../../assets/write-icon.svg';
import { ReactComponent as ResearchIcon } from '../../assets/research-icon.svg';
import { ReactComponent as CheckIcon } from '../../assets/check-icon.svg';
import { ReactComponent as FilterIcon } from '../../assets/filter-icon.svg';
import { ReactComponent as DropdownIcon } from '../../assets/dropdown-icon.svg';
import { ReactComponent as SendIcon } from '../../assets/send-icon.svg';
import { ReactComponent as WebIcon } from '../../assets/web-icon.svg';
import { ReactComponent as PdfIcon } from '../../assets/pdf-icon.svg';
import { ReactComponent as DeleteIcon } from '../../assets/delete-icon.svg';
import { ReactComponent as DocumentIcon } from '../../assets/document-icon.svg';
import { ReactComponent as AttachIcon } from '../../assets/attach-icon.svg';
import { ReactComponent as PlusIcon } from '../../assets/plus-icon.svg';
import { documentAPI } from '../../services/api';

const ChatWindow = ({ 
  sessionId: propSessionId, 
  isNewChat = false,
  selectedProjectId = null,
  onSessionCreated,
  onSwitchSession,  // New: callback to switch sessions
  activeDocumentId, 
  documentNameRefreshTrigger = 0,  // Trigger to refresh document name
  onAIMessage, 
  attachedSections = [], 
  attachedHighlights = [], 
  onClearAttachedHighlights,
  onRemoveAttachedHighlight,
  onInsertContentAtCursor,  // New: callback for cursor-aware insertion (Google Docs-like behavior)
  onActiveDocumentChange  // New: callback to change active document
}) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionIdState] = useState(null);
  const [currentAttachedSections, setCurrentAttachedSections] = useState([]);
  const [currentAttachedHighlights, setCurrentAttachedHighlights] = useState([]);
  const [editingContent, setEditingContent] = useState({}); // { pendingContentId: editedContent }
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null); // Store message while selecting project
  const [chatMode, setChatMode] = useState('write'); // 'write' | 'research'
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [commandsFilter, setCommandsFilter] = useState('all'); // commands | answers | all
  const [isCommandsMenuOpen, setIsCommandsMenuOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState('oldest'); // oldest | newest
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false); // Track if we're currently sending a message
  const [currentDocumentName, setCurrentDocumentName] = useState('');
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [isDocumentDropdownOpen, setIsDocumentDropdownOpen] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [currentChatTitle, setCurrentChatTitle] = useState('Untitled');
  const [isChatDropdownOpen, setIsChatDropdownOpen] = useState(false);
  const modeMenuRef = useRef(null);
  const commandsMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const messagesEndRef = useRef(null);
  const documentDropdownRef = useRef(null);
  const chatDropdownRef = useRef(null);
  const textareaRef = useRef(null);
  
  // Update attached sections when prop changes
  useEffect(() => {
    if (attachedSections && attachedSections.length > 0) {
      setCurrentAttachedSections(attachedSections);
    }
  }, [attachedSections]);

  // Update attached highlights when prop changes
  useEffect(() => {
    if (attachedHighlights && attachedHighlights.length > 0) {
      setCurrentAttachedHighlights(prev => {
        // Merge new highlights, avoiding duplicates
        const newHighlights = [...prev];
        attachedHighlights.forEach(h => {
          if (!newHighlights.some(existing => existing.id === h.id)) {
            newHighlights.push(h);
          }
        });
        return newHighlights;
      });
    }
  }, [attachedHighlights]);

  useEffect(() => {
    // Don't initialize if we're currently sending a message - this prevents
    // overwriting the local message state when session is created mid-send
    if (!isSendingMessage) {
      initializeSession();
    }
  }, [propSessionId, isNewChat, isSendingMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch document name when activeDocumentId or documentNameRefreshTrigger changes
  useEffect(() => {
    const fetchDocumentName = async () => {
      if (activeDocumentId) {
        try {
          const response = await documentAPI.getDocument(null, activeDocumentId);
          const title = response.data.title || 'Untitled Document';
          setCurrentDocumentName(title);
        } catch (error) {
          console.error('Failed to fetch document:', error);
          setCurrentDocumentName('Untitled Document');
        }
      } else {
        setCurrentDocumentName('');
      }
    };
    fetchDocumentName();
  }, [activeDocumentId, documentNameRefreshTrigger]);

  // Fetch available documents for dropdown
  useEffect(() => {
    const fetchAvailableDocuments = async () => {
      if (selectedProjectId) {
        try {
          const response = await documentAPI.getAllResearchDocuments(selectedProjectId);
          setAvailableDocuments(response.data.documents || []);
        } catch (error) {
          console.error('Failed to fetch documents:', error);
          setAvailableDocuments([]);
        }
      }
    };
    fetchAvailableDocuments();
  }, [selectedProjectId, documentNameRefreshTrigger]);

  // Fetch chat sessions for dropdown
  useEffect(() => {
    const fetchChatSessions = async () => {
      if (selectedProjectId) {
        try {
          const response = await chatAPI.getAllSessions(selectedProjectId);
          setChatSessions(response.data.sessions || []);
        } catch (error) {
          console.error('Failed to fetch chat sessions:', error);
          setChatSessions([]);
        }
      }
    };
    fetchChatSessions();
  }, [selectedProjectId, sessionId]); // Reload when session changes to refresh list

  // Update chat title based on messages or session
  useEffect(() => {
    if (isNewChat || messages.length === 0) {
      setCurrentChatTitle('New Chat');
    } else if (sessionId) {
      // Find current session in the list to get its title
      const currentSession = chatSessions.find(s => s.session_id === sessionId);
      if (currentSession) {
        setCurrentChatTitle(currentSession.title || 'Untitled');
      } else if (messages.length > 0) {
        // Fallback: extract title from first user message (first 5 words)
        const firstUserMessage = messages.find(m => m.role === 'user');
        if (firstUserMessage) {
          // Extract only the first part before any attached sections/highlights markers
          const content = firstUserMessage.content.split('\n\n[Attached')[0];
          const words = content.split(' ').slice(0, 5);
          setCurrentChatTitle(words.join(' ') || 'Untitled');
        }
      }
    }
  }, [messages, sessionId, isNewChat, chatSessions]);

  // Refresh sessions after sending a message to update titles
  useEffect(() => {
    const refreshSessions = async () => {
      if (selectedProjectId && sessionId && messages.length > 0) {
        try {
          const response = await chatAPI.getAllSessions(selectedProjectId);
          setChatSessions(response.data.sessions || []);
        } catch (error) {
          console.error('Failed to refresh chat sessions:', error);
        }
      }
    };
    
    // Refresh sessions after messages change (with a small delay to allow backend to update)
    if (messages.length > 0) {
      const timeoutId = setTimeout(refreshSessions, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, selectedProjectId, sessionId]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 20 * 5; // 5 lines max (20px line-height)
      
      if (scrollHeight <= maxHeight) {
        textarea.style.height = `${scrollHeight}px`;
        textarea.style.overflowY = 'hidden';
      } else {
        textarea.style.height = `${maxHeight}px`;
        textarea.style.overflowY = 'auto';
      }
    }
  }, [inputMessage]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target)) {
        setIsModeMenuOpen(false);
      }
      if (commandsMenuRef.current && !commandsMenuRef.current.contains(event.target)) {
        setIsCommandsMenuOpen(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setIsSortMenuOpen(false);
      }
      if (documentDropdownRef.current && !documentDropdownRef.current.contains(event.target)) {
        setIsDocumentDropdownOpen(false);
      }
      if (chatDropdownRef.current && !chatDropdownRef.current.contains(event.target)) {
        setIsChatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initializeSession = async () => {
    // If it's a new chat, don't create session yet - wait for first message
    if (isNewChat) {
      setMessages([]);
      setSessionIdState(null);
      return;
    }
    
    try {
      // Use propSessionId if provided, otherwise check localStorage
      const sessionIdToUse = propSessionId || getSessionId();
      
      if (sessionIdToUse) {
        // Load existing session
        const response = await chatAPI.getSession(sessionIdToUse);
        setMessages(response.data.messages || []);
        setSessionIdState(sessionIdToUse);
        if (!propSessionId) {
          setSessionId(sessionIdToUse);
        }
      } else {
        // No session and not new chat mode - start new chat
        setMessages([]);
        setSessionIdState(null);
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setMessages([]);
      setSessionIdState(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage = inputMessage.trim();
    
    // If this is a new chat and no session exists, need to create one first
    if (isNewChat && !sessionId) {
      // If we have a selected project, create session with it
      if (selectedProjectId) {
        await createSessionAndSendMessage(selectedProjectId, userMessage);
      } else {
        // Show project selector
        setPendingMessage(userMessage);
        setShowProjectSelector(true);
      }
      return;
    }
    
    // If we have a session, send the message
    if (sessionId) {
      await sendMessageToSession(sessionId, userMessage);
    }
  };

  const handleKeyDown = (e) => {
    // If Enter is pressed without Shift, send the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
    // If Shift+Enter is pressed, allow default behavior (new line)
  };
  
  const createSessionAndSendMessage = async (projectId, userMessage) => {
    setInputMessage('');
    setLoading(true);
    setIsSendingMessage(true); // Mark that we're sending a message
    
    try {
      // Create the session first
      const sessionResponse = await chatAPI.createSession(projectId);
      const newSessionId = sessionResponse.data.session_id;
      
      setSessionId(newSessionId);
      setSessionIdState(newSessionId);
      
      // Notify parent about the new session
      if (onSessionCreated) {
        onSessionCreated(newSessionId);
      }
      
      // Now send the message
      await sendMessageToSession(newSessionId, userMessage);
    } catch (error) {
      console.error('Failed to create session:', error);
      setLoading(false);
      setIsSendingMessage(false);
      alert('Failed to create chat session. Please try again.');
    }
  };
  
  const handleProjectSelected = async (projectId, projectName) => {
    setShowProjectSelector(false);
    if (pendingMessage) {
      await createSessionAndSendMessage(projectId, pendingMessage);
      setPendingMessage(null);
    }
  };
  
  const sendMessageToSession = async (targetSessionId, userMessage) => {
    const attachedSectionsToSend = currentAttachedSections;
    const attachedHighlightsToSend = currentAttachedHighlights;
    
    // Prepare message content with attached sections and highlights
    let messageContent = userMessage;
    
    // Add attached sections
    if (attachedSectionsToSend.length > 0) {
      const attachedMarkdown = attachedSectionsToSend
        .map(section => section.content || '')
        .filter(content => content.trim())
        .join('\n\n');
      
      if (attachedMarkdown) {
        messageContent = `${messageContent}\n\n[Attached sections from document:]\n\n${attachedMarkdown}`;
      }
    }
    
    // Add attached highlights
    if (attachedHighlightsToSend.length > 0) {
      const highlightsMarkdown = attachedHighlightsToSend.map(h => {
        let highlightText = `**Highlight:** "${h.text}"`;
        if (h.note) {
          highlightText += `\n**Note:** ${h.note}`;
        }
        if (h.source) {
          highlightText += `\n**Source:** ${h.sourceTitle || h.source}`;
        }
        if (h.colorTag) {
          highlightText += `\n**Color:** ${h.colorTag}`;
        }
        if (h.tags && h.tags.length > 0) {
          highlightText += `\n**Tags:** ${h.tags.join(', ')}`;
        }
        return highlightText;
      }).join('\n\n---\n\n');
      
      messageContent = `${messageContent}\n\n[Attached highlights:]\n\n${highlightsMarkdown}`;
    }
    
    setInputMessage('');
    setLoading(true);
    setIsSendingMessage(true); // Mark that we're sending a message
    setCurrentAttachedSections([]); // Clear attached sections after sending
    setCurrentAttachedHighlights([]); // Clear attached highlights after sending
    if (onClearAttachedHighlights) {
      onClearAttachedHighlights();
    }

    // Add user message to UI immediately (show raw markdown if sections/highlights attached)
    const newUserMessage = {
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      attachedSections: attachedSectionsToSend.length > 0 ? attachedSectionsToSend : undefined,
      attachedHighlights: attachedHighlightsToSend.length > 0 ? attachedHighlightsToSend : undefined
    };
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      // Combine sections and highlights for API call
      const allAttachments = [
        ...attachedSectionsToSend,
        ...attachedHighlightsToSend.map(h => ({
          type: 'highlight',
          content: `Highlight: "${h.text}"${h.note ? `\nNote: ${h.note}` : ''}${h.source ? `\nSource: ${h.sourceTitle || h.source}` : ''}`
        }))
      ];
      const response = await chatAPI.sendMessage(targetSessionId, userMessage, allAttachments, chatMode);
      // Extract message, document_content, sources, status, and pending_content_id from response
      const chatMessage = response.data.response || '';
      const documentContent = response.data.document_content || '';
      const sources = response.data.sources || [];
      const status = response.data.status;
      const pendingContentId = response.data.pending_content_id;
      
      const aiMessage = {
        role: 'assistant',
        content: chatMessage,
        sources: sources,
        document_content: documentContent,
        status: status,
        pending_content_id: pendingContentId,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      
      // Don't notify parent for pending content - only notify when approved
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setIsSendingMessage(false); // Clear the flag when done
    }
  };
  
  // Direct insertion at cursor position or end of document (no AI placement)
  // Uses Google Docs-like behavior: inserts at the last known cursor position
  // even if user clicked away from the document (e.g., into chat window)
  const handleApprove = async (pendingContentId, editedContent) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      // Find the message with this pending content to get the content
      const pendingMessage = messages.find(msg => msg.pending_content_id === pendingContentId);
      const contentToInsert = editedContent || pendingMessage?.document_content || '';
      
      if (!contentToInsert) {
        alert('No content to insert.');
        setLoading(false);
        return;
      }
      
      // Convert markdown to HTML for the TipTap editor
      const htmlContent = markdownToHtml(contentToInsert);
      
      // Use client-side insertion at cursor position (Google Docs-like behavior)
      // This inserts at the saved cursor position, or at end if no position saved
      if (onInsertContentAtCursor) {
        const inserted = onInsertContentAtCursor(htmlContent);
        
        if (inserted) {
          // Client-side insertion successful - now clear pending content on backend
          try {
            await chatAPI.clearPendingContent(sessionId, pendingContentId);
          } catch (clearError) {
            // Log but don't fail - the content is already inserted
            console.warn('Failed to clear pending content on backend:', clearError);
          }
          
          // Update message status (keep document_content so it can be shown when expanded)
          setMessages((prev) => prev.map(msg => 
            msg.pending_content_id === pendingContentId
              ? { ...msg, status: 'approved' }
              : msg
          ));
          
          // Clear editing state
          setEditingContent((prev) => {
            const newState = { ...prev };
            delete newState[pendingContentId];
            return newState;
          });
          
          // Note: We don't call onAIMessage here because auto-save will handle
          // syncing the document to backend, so no need to trigger a refresh
        } else {
          // Client-side insertion failed - fall back to backend insertion
          console.warn('Client-side insertion failed, falling back to backend');
          await fallbackToBackendInsertion(pendingContentId, editedContent);
        }
      } else {
        // No client-side insertion available - use backend
        await fallbackToBackendInsertion(pendingContentId, editedContent);
      }
      
    } catch (error) {
      console.error('Failed to insert content:', error);
      alert('Failed to insert content. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Fallback to backend insertion (appends to end of document)
  const fallbackToBackendInsertion = async (pendingContentId, editedContent) => {
    const response = await chatAPI.directInsertContent(sessionId, pendingContentId, editedContent, activeDocumentId);
    
    // Update message status (keep document_content so it can be shown when expanded)
    setMessages((prev) => prev.map(msg => 
      msg.pending_content_id === pendingContentId
        ? { ...msg, status: 'approved' }
        : msg
    ));
    
    // Clear editing state
    setEditingContent((prev) => {
      const newState = { ...prev };
      delete newState[pendingContentId];
      return newState;
    });
    
    // Notify parent to refresh document
    if (onAIMessage) {
      onAIMessage('approved');
    }
  };

  const handleEdit = (pendingContentId, editedContent) => {
    setEditingContent((prev) => ({
      ...prev,
      [pendingContentId]: editedContent
    }));
  };

  // Build conversation pairs to keep user + assistant responses together
  const pairs = [];
  let currentPair = null;
  messages.forEach((message, index) => {
    if (message.role === 'user') {
      if (currentPair) {
        pairs.push(currentPair);
      }
      currentPair = {
        userMessage: message,
        userIndex: index,
        assistantMessages: []
      };
    } else if (currentPair) {
      currentPair.assistantMessages.push({ message, index });
    } else {
      // Orphan assistant message (edge case)
      pairs.push({
        userMessage: null,
        userIndex: null,
        assistantMessages: [{ message, index }]
      });
    }
  });
  if (currentPair) {
    pairs.push(currentPair);
  }

  // Sort pairs by the user message index (or first assistant index for orphans)
  const sortedPairs = [...pairs].sort((a, b) => {
    const aIdx = a.userIndex !== null ? a.userIndex : (a.assistantMessages[0]?.index ?? 0);
    const bIdx = b.userIndex !== null ? b.userIndex : (b.assistantMessages[0]?.index ?? 0);
    if (sortOrder === 'oldest') return aIdx - bIdx;
    return bIdx - aIdx;
  });

  // Count rendered messages for empty-state check
  const renderedMessageCount = sortedPairs.reduce((count, pair) => {
    if (commandsFilter !== 'answers' && pair.userMessage) count += 1;
    if (commandsFilter !== 'commands') count += pair.assistantMessages.length;
    return count;
  }, 0);

  const handleNewChat = () => {
    if (onSwitchSession) {
      onSwitchSession(null);
    }
    setIsChatDropdownOpen(false);
  };

  const handleSessionSelect = (sessionId) => {
    if (onSwitchSession) {
      onSwitchSession(sessionId);
    }
    setIsChatDropdownOpen(false);
  };

  // Determine if we're in empty state
  const isEmptyState = renderedMessageCount === 0;

  // Chat input component (reusable)
  const chatInputArea = (
    <div className="chat-input-area">
        <div className="chat-input-container">
          {/* Top Section: Document Selector and Bookmark */}
          <div className="chat-input-top-section">
            <div className="document-selector-wrapper" ref={documentDropdownRef}>
              <button
                type="button"
                className="document-selector"
                onClick={() => setIsDocumentDropdownOpen((prev) => !prev)}
                aria-expanded={isDocumentDropdownOpen}
                aria-haspopup="true"
              >
                <DocumentIcon className="document-selector-icon" />
                <span className="document-selector-name">
                  {currentDocumentName || 'No document selected'}
                </span>
                <DropdownIcon className="document-selector-caret" />
              </button>
              {isDocumentDropdownOpen && availableDocuments.length > 0 && (
                <div className="document-dropdown">
                  {availableDocuments.map((doc) => (
                    <button
                      key={doc.document_id}
                      type="button"
                      className={`document-dropdown-item ${doc.document_id === activeDocumentId ? 'active' : ''}`}
                      onClick={() => {
                        if (onActiveDocumentChange) {
                          onActiveDocumentChange(doc.document_id);
                        }
                        setIsDocumentDropdownOpen(false);
                      }}
                    >
                      <span>{doc.title || 'Untitled Document'}</span>
                      {doc.document_id === activeDocumentId && <CheckIcon className="document-check-icon" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="attach-button"
              aria-label="Attach"
              title="Attach"
            >
              <AttachIcon className="attach-button-icon" />
            </button>
          </div>

          {/* Middle Section: Input Area */}
          <div className="chat-input-middle-section">
          {(currentAttachedSections.length > 0 || currentAttachedHighlights.length > 0) && (
            <div className="attached-items-container">
              {currentAttachedSections.length > 0 && (
                <div className="attached-sections-indicator">
                  <span className="attached-icon">📄</span>
                  <span className="attached-count">{currentAttachedSections.length} section{currentAttachedSections.length !== 1 ? 's' : ''}</span>
                  <button
                    className="clear-attached-button"
                    onClick={() => setCurrentAttachedSections([])}
                    title="Clear attached sections"
                  >
                    ×
                  </button>
                </div>
              )}
              {currentAttachedHighlights.length > 0 && (
                <div className="attached-highlights-indicator">
                  <div className="attached-highlights-list">
                    {currentAttachedHighlights.map((h, idx) => {
                      const getSourceName = () => {
                        if (h.type === 'web') {
                          return h.sourceTitle || 'Web Page';
                        } else if (h.type === 'pdf') {
                          return h.source || 'PDF Document';
                        }
                        return 'Document';
                      };

                      const getSourceIcon = () => {
                        if (h.type === 'web') {
                          return <WebIcon className="source-type-icon" />;
                        } else if (h.type === 'pdf') {
                          return <PdfIcon className="source-type-icon" />;
                        }
                        return null;
                      };

                      const truncateText = (text, maxLength = 30) => {
                        if (!text) return '';
                        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
                      };

                      const truncateFileName = (fileName, maxLength = 25) => {
                        if (!fileName) return 'Untitled';
                        return fileName.length > maxLength ? fileName.substring(0, maxLength) + '...' : fileName;
                      };

                      return (
                        <div key={h.id || idx} className="attached-highlight-chip">
                          {getSourceIcon()}
                          <span className="source-file-name">{truncateFileName(getSourceName())}</span>
                          <span className="source-separator">|</span>
                          <span className="highlight-preview">{truncateText(h.text)}</span>
                          <button
                            className="remove-highlight-button"
                            onClick={() => {
                              setCurrentAttachedHighlights(prev => prev.filter(item => item.id !== h.id));
                              if (onRemoveAttachedHighlight) {
                                onRemoveAttachedHighlight(h.id);
                              }
                            }}
                            title="Remove this highlight"
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Anything..."
              disabled={loading}
              rows={1}
            />
          </div>

          {/* Bottom Section: Mode Dropdown and Send Button */}
          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <div className="chat-input-bottom-section">
              <div className="mode-dropdown" ref={modeMenuRef}>
                <button
                  type="button"
                  className={`mode-toggle ${isModeMenuOpen ? 'open' : ''}`}
                  onClick={() => setIsModeMenuOpen((prev) => !prev)}
                  aria-expanded={isModeMenuOpen}
                  aria-haspopup="true"
                >
                  {chatMode === 'write' ? (
                    <WriteIcon className="mode-toggle-icon" />
                  ) : (
                    <ResearchIcon className="mode-toggle-icon" />
                  )}
                  <span>{chatMode === 'write' ? 'Write' : 'Research'}</span>
                  <DropdownIcon className="caret-icon" />
                </button>
                {isModeMenuOpen && (
                  <div className="mode-menu">
                    <button
                      type="button"
                      className={`mode-option ${chatMode === 'write' ? 'active' : ''}`}
                      onClick={() => {
                        setChatMode('write');
                        setIsModeMenuOpen(false);
                      }}
                    >
                      <div className="mode-option-left">
                        <WriteIcon className="mode-option-icon" />
                        <span className="mode-option-label">Write</span>
                      </div>
                      {chatMode === 'write' && <CheckIcon className="mode-check-icon" />}
                    </button>
                    <button
                      type="button"
                      className={`mode-option ${chatMode === 'research' ? 'active' : ''}`}
                      onClick={() => {
                        setChatMode('research');
                        setIsModeMenuOpen(false);
                      }}
                    >
                      <div className="mode-option-left">
                        <ResearchIcon className="mode-option-icon" />
                        <span className="mode-option-label">Research</span>
                      </div>
                      {chatMode === 'research' && <CheckIcon className="mode-check-icon" />}
                    </button>
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="send-button"
                disabled={loading || !inputMessage.trim()}
              >
                <SendIcon className="send-icon" />
              </button>
            </div>
          </form>
        </div>
      </div>
  );

  return (
    <div className="chat-window">
      {/* Chat Header - Always visible with dropdown, filter, and add button */}
      <div className="chat-header">
        <div className="chat-header-top">
          <div className="chat-session-dropdown-wrapper" ref={chatDropdownRef}>
            <button
              type="button"
              className="chat-session-selector"
              onClick={() => setIsChatDropdownOpen((prev) => !prev)}
              aria-expanded={isChatDropdownOpen}
              aria-haspopup="true"
            >
              <span className="chat-session-title">{currentChatTitle}</span>
              <DropdownIcon className="chat-session-caret" />
            </button>
            {isChatDropdownOpen && (
              <div className="chat-session-dropdown">
                <button
                  type="button"
                  className="chat-session-new-button"
                  onClick={handleNewChat}
                >
                  <PlusIcon className="chat-session-new-icon" />
                  <span>New Chat</span>
                </button>
                {chatSessions.length > 0 && (
                  <div className="chat-session-list">
                    {chatSessions.map((session) => (
                      <button
                        key={session.session_id}
                        type="button"
                        className={`chat-session-item ${sessionId === session.session_id && !isNewChat ? 'active' : ''}`}
                        onClick={() => handleSessionSelect(session.session_id)}
                      >
                        <span>{session.title || 'Untitled Chat'}</span>
                        {sessionId === session.session_id && !isNewChat && (
                          <CheckIcon className="chat-session-check-icon" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className={`filter-button ${isFilterActive ? 'active' : ''}`}
              aria-label="Filter questions"
              aria-pressed={isFilterActive}
              onClick={() => setIsFilterActive((prev) => !prev)}
            >
              <FilterIcon className="filter-icon" />
            </button>
            <button
              type="button"
              className="add-chat-button"
              aria-label="New Chat"
              onClick={handleNewChat}
            >
              <PlusIcon className="add-chat-icon" />
            </button>
          </div>
          {isFilterActive && (
            <div className="filter-dropdown">
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Search previous commands"
                  className="filter-search-input"
                />
                <div className="filter-actions">
                  <div className="filter-actions-right">
                    <div className="sort-menu-wrapper" ref={sortMenuRef}>
                      <button
                        type="button"
                        className="filter-chip with-caret"
                        onClick={() => setIsSortMenuOpen((prev) => !prev)}
                        aria-haspopup="true"
                        aria-expanded={isSortMenuOpen}
                      >
                        <span>Sort by : {sortOrder === 'oldest' ? 'Oldest' : 'Newest'}</span>
                        <DropdownIcon className="caret-icon" />
                      </button>
                      {isSortMenuOpen && (
                        <div className="sort-dropdown">
                          <button
                            type="button"
                            className={`commands-item ${sortOrder === 'oldest' ? 'active' : ''}`}
                            onClick={() => {
                              setSortOrder('oldest');
                              setIsSortMenuOpen(false);
                            }}
                          >
                            <span>Oldest</span>
                            {sortOrder === 'oldest' && <CheckIcon className="check-icon" />}
                          </button>
                          <button
                            type="button"
                            className={`commands-item ${sortOrder === 'newest' ? 'active' : ''}`}
                            onClick={() => {
                              setSortOrder('newest');
                              setIsSortMenuOpen(false);
                            }}
                          >
                            <span>Newest</span>
                            {sortOrder === 'newest' && <CheckIcon className="check-icon" />}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="commands-menu-wrapper" ref={commandsMenuRef}>
                      <button
                        type="button"
                        className="filter-chip with-caret"
                        onClick={() => setIsCommandsMenuOpen((prev) => !prev)}
                        aria-haspopup="true"
                        aria-expanded={isCommandsMenuOpen}
                      >
                        <span>Commands</span>
                        <DropdownIcon className="caret-icon" />
                      </button>
                      {isCommandsMenuOpen && (
                        <div className="commands-dropdown">
                          <button
                            type="button"
                            className={`commands-item ${commandsFilter === 'commands' ? 'active' : ''}`}
                            onClick={() => {
                              setCommandsFilter('commands');
                              setIsCommandsMenuOpen(false);
                            }}
                          >
                            <span>Commands</span>
                            {commandsFilter === 'commands' && <CheckIcon className="check-icon" />}
                          </button>
                          <button
                            type="button"
                            className={`commands-item ${commandsFilter === 'answers' ? 'active' : ''}`}
                            onClick={() => {
                              setCommandsFilter('answers');
                              setIsCommandsMenuOpen(false);
                            }}
                          >
                            <span>Answers</span>
                            {commandsFilter === 'answers' && <CheckIcon className="check-icon" />}
                          </button>
                          <button
                            type="button"
                            className={`commands-item ${commandsFilter === 'all' ? 'active' : ''}`}
                            onClick={() => {
                              setCommandsFilter('all');
                              setIsCommandsMenuOpen(false);
                            }}
                          >
                            <span>All</span>
                            {commandsFilter === 'all' && <CheckIcon className="check-icon" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      
      {/* Chat input at top for empty state */}
      {isEmptyState && chatInputArea}
      
      <div className="chat-messages">
        {sortedPairs.map((pair, pairIndex) => (
            <div key={pairIndex} className="conversation-pair">
              {pair.userMessage && commandsFilter !== 'answers' && (
                <div className="user-prompt-sticky">
                  <MessageBubble 
                    message={pair.userMessage}
                    onApprove={handleApprove}
                    onEdit={handleEdit}
                    editedContent={editingContent[pair.userMessage.pending_content_id]}
                    mode={chatMode}
                  />
                </div>
              )}
              <div className="assistant-responses">
                {commandsFilter !== 'commands' &&
                  pair.assistantMessages.map(({ message, index }) => (
                    <MessageBubble 
                      key={index} 
                      message={message}
                      onApprove={handleApprove}
                      onEdit={handleEdit}
                      editedContent={editingContent[message.pending_content_id]}
                      mode={chatMode}
                    />
                  ))}
              </div>
            </div>
          ))}
        {loading && (
          <div className="loading-indicator">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat input at bottom for non-empty state */}
      {!isEmptyState && chatInputArea}
      
      {showProjectSelector && (
        <ProjectSelector
          onSelectProject={handleProjectSelected}
          onClose={() => {
            setShowProjectSelector(false);
            setPendingMessage(null);
          }}
        />
      )}
    </div>
  );
};

export default ChatWindow;


