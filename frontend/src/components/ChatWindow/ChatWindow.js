import React, { useState, useEffect, useRef } from 'react';
import { chatAPI } from '../../services/api';
import { getSessionId, setSessionId } from '../../utils/auth';
import MessageBubble from './MessageBubble';
import ProjectSelector from '../ProjectSelector/ProjectSelector';
import './ChatWindow.css';

const ChatWindow = ({ 
  sessionId: propSessionId, 
  isNewChat = false,
  selectedProjectId = null,
  onSessionCreated,
  activeDocumentId, 
  onAIMessage, 
  attachedSections = [], 
  attachedHighlights = [], 
  onClearAttachedHighlights 
}) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionIdState] = useState(null);
  const [currentAttachedSections, setCurrentAttachedSections] = useState([]);
  const [currentAttachedHighlights, setCurrentAttachedHighlights] = useState([]);
  const [editingContent, setEditingContent] = useState({}); // { pendingContentId: editedContent }
  const [showRewritePrompt, setShowRewritePrompt] = useState(false);
  const [rejectedMessageId, setRejectedMessageId] = useState(null);
  const [originalUserMessage, setOriginalUserMessage] = useState('');
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null); // Store message while selecting project
  const messagesEndRef = useRef(null);
  
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
    initializeSession();
  }, [propSessionId, isNewChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
  
  const createSessionAndSendMessage = async (projectId, userMessage) => {
    setInputMessage('');
    setLoading(true);
    
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
      const response = await chatAPI.sendMessage(targetSessionId, userMessage, allAttachments);
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
      
      // Store original user message for rewrite if needed
      if (status === 'pending_approval') {
        setOriginalUserMessage(userMessage);
      }
      
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
    }
  };
  
  const handleApprove = async (pendingContentId, editedContent) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      const response = await chatAPI.approveContent(sessionId, pendingContentId, editedContent, activeDocumentId);
      
      // Update message status
      setMessages((prev) => prev.map(msg => 
        msg.pending_content_id === pendingContentId
          ? { ...msg, status: 'approved', document_content: null }
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
      
      // Add success message
      const successMessage = {
        role: 'assistant',
        content: response.data.message || 'Content approved and placed successfully.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, successMessage]);
      
    } catch (error) {
      console.error('Failed to approve content:', error);
      alert('Failed to approve content. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleReject = async (pendingContentId) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      const response = await chatAPI.rejectContent(sessionId, pendingContentId);
      
      // Update message status
      setMessages((prev) => prev.map(msg => 
        msg.pending_content_id === pendingContentId
          ? { ...msg, status: 'rejected' }
          : msg
      ));
      
      // Show rewrite prompt
      setShowRewritePrompt(true);
      setRejectedMessageId(pendingContentId);
      
      // Add rejection message
      const rejectionMessage = {
        role: 'assistant',
        content: response.data.message || 'Content rejected. Would you like to request a rewrite?',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, rejectionMessage]);
      
    } catch (error) {
      console.error('Failed to reject content:', error);
      alert('Failed to reject content. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRewrite = async () => {
    if (!sessionId || !originalUserMessage) return;
    
    setLoading(true);
    setShowRewritePrompt(false);
    
    try {
      const response = await chatAPI.rewriteContent(sessionId, originalUserMessage);
      
      const chatMessage = response.data.response || '';
      const documentContent = response.data.document_content || '';
      const sources = response.data.sources || [];
      const status = response.data.status;
      const pendingContentId = response.data.pending_content_id;
      
      const rewriteMessage = {
        role: 'assistant',
        content: chatMessage,
        sources: sources,
        document_content: documentContent,
        status: status,
        pending_content_id: pendingContentId,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, rewriteMessage]);
      
    } catch (error) {
      console.error('Failed to rewrite content:', error);
      alert('Failed to rewrite content. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleEdit = (pendingContentId, editedContent) => {
    setEditingContent((prev) => ({
      ...prev,
      [pendingContentId]: editedContent
    }));
  };

  return (
    <div className="chat-window">
      {/* Chat Header - Shows title only */}
      {messages.length > 0 && (
        <div className="chat-header">
          <h1 className="chat-title">Research Session</h1>
        </div>
      )}
      
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="new-chat-empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h2>New Chat</h2>
            <p>Start a conversation with your AI research assistant.</p>
            <p className="empty-state-hint">Type a message below to begin.</p>
          </div>
        )}
        {(() => {
          // Group messages into conversation pairs (user prompt + assistant responses)
          const pairs = [];
          let currentPair = null;
          
          messages.forEach((message, index) => {
            if (message.role === 'user') {
              // Start a new pair with user message
              if (currentPair) {
                pairs.push(currentPair);
              }
              currentPair = {
                userMessage: message,
                userIndex: index,
                assistantMessages: []
              };
            } else if (currentPair) {
              // Add assistant message to current pair
              currentPair.assistantMessages.push({ message, index });
            } else {
              // Orphan assistant message (shouldn't happen normally)
              pairs.push({
                userMessage: null,
                userIndex: null,
                assistantMessages: [{ message, index }]
              });
            }
          });
          
          // Don't forget the last pair
          if (currentPair) {
            pairs.push(currentPair);
          }
          
          return pairs.map((pair, pairIndex) => (
            <div key={pairIndex} className="conversation-pair">
              {pair.userMessage && (
                <div className="user-prompt-sticky">
                  <MessageBubble 
                    message={pair.userMessage}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={handleEdit}
                    editedContent={editingContent[pair.userMessage.pending_content_id]}
                  />
                </div>
              )}
              <div className="assistant-responses">
                {pair.assistantMessages.map(({ message, index }) => (
                  <MessageBubble 
                    key={index} 
                    message={message}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={handleEdit}
                    editedContent={editingContent[message.pending_content_id]}
                  />
                ))}
              </div>
            </div>
          ));
        })()}
        {showRewritePrompt && (
          <div className="rewrite-prompt">
            <p>Content was rejected. Would you like to request a rewrite?</p>
            <div className="rewrite-actions">
              <button className="rewrite-btn" onClick={handleRewrite} disabled={loading}>
                Request Rewrite
              </button>
              <button className="cancel-rewrite-btn" onClick={() => setShowRewritePrompt(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
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
              <span className="attached-icon">✨</span>
              <span className="attached-count">{currentAttachedHighlights.length} highlight{currentAttachedHighlights.length !== 1 ? 's' : ''}</span>
              <div className="attached-highlights-list">
                {currentAttachedHighlights.map((h, idx) => (
                  <div key={h.id} className="attached-highlight-chip">
                    <span className="highlight-preview">"{h.text.substring(0, 30)}{h.text.length > 30 ? '...' : ''}"</span>
                    <button
                      className="remove-highlight-button"
                      onClick={() => {
                        setCurrentAttachedHighlights(prev => prev.filter(item => item.id !== h.id));
                      }}
                      title="Remove this highlight"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="clear-attached-button"
                onClick={() => {
                  setCurrentAttachedHighlights([]);
                  if (onClearAttachedHighlights) onClearAttachedHighlights();
                }}
                title="Clear all highlights"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
      <div className="chat-input-area">
        <div className="chat-input-container">
          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask Anything..."
              disabled={loading}
            />
            <div className="chat-input-actions">
              <button type="button" className="write-mode-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Write</span>
                <svg className="caret-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <button
                type="submit"
                className="send-button"
                disabled={loading || !inputMessage.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
      
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


