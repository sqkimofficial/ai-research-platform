import React, { useState, useEffect, useRef } from 'react';
import { chatAPI } from '../../services/api';
import { getSessionId, setSessionId } from '../../utils/auth';
import MessageBubble from './MessageBubble';
import './ChatWindow.css';

const ChatWindow = ({ sessionId: propSessionId, activeDocumentId, onAIMessage, attachedSections = [], attachedHighlights = [], onClearAttachedHighlights }) => {
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
  }, [propSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeSession = async () => {
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
        // Create new session
        const response = await chatAPI.createSession();
        const newSessionId = response.data.session_id;
        setSessionId(newSessionId);
        setSessionIdState(newSessionId);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
      alert('Failed to initialize chat session. Please try again.');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading || !sessionId) return;

    const userMessage = inputMessage.trim();
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
      const response = await chatAPI.sendMessage(sessionId, userMessage, allAttachments);
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
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Start a conversation by sending a message below.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <MessageBubble 
            key={index} 
            message={message}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
            editedContent={editingContent[message.pending_content_id]}
          />
        ))}
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
      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="chat-input"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={
            currentAttachedSections.length > 0 || currentAttachedHighlights.length > 0
              ? `Type your message (${currentAttachedSections.length + currentAttachedHighlights.length} item${currentAttachedSections.length + currentAttachedHighlights.length !== 1 ? 's' : ''} attached)...`
              : "Type your message..."
          }
          disabled={loading || !sessionId}
        />
        <button
          type="submit"
          className="send-button"
          disabled={loading || !inputMessage.trim() || !sessionId}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatWindow;


