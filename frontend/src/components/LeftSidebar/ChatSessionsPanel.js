import React, { useState, useEffect } from 'react';
import { chatAPI } from '../../services/api';
import './ChatSessionsPanel.css';

const ChatSessionsPanel = ({ isOpen, onClose, onSelectSession, currentSessionId, isNewChat }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await chatAPI.getAllSessions();
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
    // Pass full session object with project info
    onSelectSession(session.session_id, session.project_id, session.project_name);
    onClose();
  };

  const handleNewChat = () => {
    // Pass null to indicate new chat - session will be created lazily on first message
    // Project remains the same (selected at login)
    onSelectSession(null, null, null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="chat-sessions-panel">
      <div className="panel-header">
        <h2>Chats</h2>
        <button className="close-panel-button" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="panel-content">
        <button 
          className={`new-chat-btn ${isNewChat && !currentSessionId ? 'active' : ''}`} 
          onClick={handleNewChat}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
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
                <div className="session-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <div className="session-info">
                  <div className="session-title-row">
                    <span className="session-title">{session.title || 'Untitled Chat'}</span>
                    <span className="session-date">{formatDate(session.updated_at)}</span>
                  </div>
                  <div className="session-meta">
                    <span className="session-project">{session.project_name || 'No project'}</span>
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

