import React, { useState, useEffect } from 'react';
import { chatAPI } from '../../services/api';
import './ChatSessionsPanel.css';
import plusIcon from '../../assets/plus-icon.svg';

const ANIMATION_DURATION = 200; // ms

const ChatSessionsPanel = ({ isOpen, onClose, onSelectSession, currentSessionId, isNewChat, selectedProjectId, currentProjectName, onHoverStart, onHoverEnd }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen && selectedProjectId) {
      loadSessions();
    }
  }, [isOpen, selectedProjectId]);

  useEffect(() => {
    let timeoutId;
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      timeoutId = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, ANIMATION_DURATION);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOpen, shouldRender]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError('');
      // Filter sessions by selected project
      const response = await chatAPI.getAllSessions(selectedProjectId);
      setSessions(response.data.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to load chat sessions.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const handleSessionClick = (session) => {
    // Pass session id - project stays the same since all sessions are filtered by current project
    onSelectSession(session.session_id);
    onClose();
  };

  const handleNewChat = () => {
    // Pass null to indicate new chat - session will be created lazily on first message
    // Project remains the same (selected at login)
    onSelectSession(null);
    onClose();
  };

  if (!shouldRender) return null;

  return (
    <div 
      className={`chat-sessions-panel ${isOpen ? 'open' : ''} ${isClosing ? 'closing' : ''}`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div className="panel-header">
        <div className="panel-header-title">
          <h2>Chats</h2>
          {currentProjectName && (
            <span className="panel-project-badge">
              📁 {currentProjectName}
            </span>
          )}
        </div>
      </div>

      <div className="panel-content">
        <button 
          className={`new-chat-btn ${isNewChat && !currentSessionId ? 'active' : ''}`} 
          onClick={handleNewChat}
        >
          <img src={plusIcon} alt="" className="panel-icon" />
          New Chat
        </button>

        {loading ? (
          <div className="panel-loading">
            <div className="loading-spinner"></div>
            <span>Loading chats...</span>
          </div>
        ) : error ? (
          <div className="panel-error">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="panel-empty">
            <p>No chat sessions yet.</p>
            <p className="empty-hint">Click "New Chat" to start a conversation.</p>
          </div>
        ) : (
          <div className="sessions-list">
            {sessions.map((session) => (
              <div
                key={session.session_id}
                className={`session-item ${currentSessionId === session.session_id && !isNewChat ? 'active' : ''}`}
                onClick={() => handleSessionClick(session)}
              >
                <div className="session-info">
                  <div className="session-title-row">
                    <span className="session-title">{session.title || 'Untitled Chat'}</span>
                    <span className="session-date">{formatDate(session.updated_at)}</span>
                  </div>
                  <div className="session-meta">
                    <span className="session-messages">{session.message_count} messages</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSessionsPanel;

