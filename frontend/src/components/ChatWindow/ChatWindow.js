import React, { useState, useEffect, useRef } from 'react';
import { chatAPI } from '../../services/api';
import { getSessionId, setSessionId } from '../../utils/auth';
import MessageBubble from './MessageBubble';
import './ChatWindow.css';

const ChatWindow = ({ sessionId: propSessionId, onAIMessage, attachedSections = [] }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionIdState] = useState(null);
  const [currentAttachedSections, setCurrentAttachedSections] = useState([]);
  const messagesEndRef = useRef(null);
  
  // Update attached sections when prop changes
  useEffect(() => {
    if (attachedSections && attachedSections.length > 0) {
      setCurrentAttachedSections(attachedSections);
    }
  }, [attachedSections]);

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
    
    // Prepare message content with attached sections
    let messageContent = userMessage;
    if (attachedSectionsToSend.length > 0) {
      const attachedMarkdown = attachedSectionsToSend
        .map(section => section.content || '')
        .filter(content => content.trim())
        .join('\n\n');
      
      if (attachedMarkdown) {
        messageContent = `${userMessage}\n\n[Attached sections from document:]\n\n${attachedMarkdown}`;
      }
    }
    
    setInputMessage('');
    setLoading(true);
    setCurrentAttachedSections([]); // Clear attached sections after sending

    // Add user message to UI immediately (show raw markdown if sections attached)
    const newUserMessage = {
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      attachedSections: attachedSectionsToSend.length > 0 ? attachedSectionsToSend : undefined
    };
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      const response = await chatAPI.sendMessage(sessionId, userMessage, attachedSectionsToSend);
      // Extract message, document_content, and sources from response
      const chatMessage = response.data.response || '';
      const documentContent = response.data.document_content || '';
      const sources = response.data.sources || [];
      
      const aiMessage = {
        role: 'assistant',
        content: chatMessage,
        sources: sources,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      
      // Notify parent component if document content was added (for document refresh)
      if (onAIMessage && documentContent) {
        onAIMessage(documentContent);
      }
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

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Start a conversation by sending a message below.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
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
      {currentAttachedSections.length > 0 && (
        <div className="attached-sections-indicator">
          <span className="attached-count">{currentAttachedSections.length} section{currentAttachedSections.length !== 1 ? 's' : ''} attached</span>
          <button
            className="clear-attached-button"
            onClick={() => setCurrentAttachedSections([])}
            title="Clear attached sections"
          >
            ×
          </button>
        </div>
      )}
      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="chat-input"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={currentAttachedSections.length > 0 ? `Type your message (${currentAttachedSections.length} section${currentAttachedSections.length !== 1 ? 's' : ''} attached)...` : "Type your message..."}
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


