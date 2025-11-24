import React, { useState, useEffect } from 'react';
import { chatAPI } from '../../services/api';
import './HomePage.css';

const HomePage = ({ onSelectSession, onCreateNewSession }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await chatAPI.getAllSessions();
      setSessions(response.data.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to load chat sessions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSessionClick = (sessionId) => {
    onSelectSession(sessionId);
  };

  const handleNewChat = async () => {
    try {
      const response = await chatAPI.createSession();
      onSelectSession(response.data.session_id);
    } catch (err) {
      console.error('Failed to create new session:', err);
      setError('Failed to create new chat session. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="homepage-container">
        <div className="homepage-content">
          <div className="loading-state">Loading sessions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="homepage-container">
      <div className="homepage-content">
        <div className="homepage-header">
          <h1>Chat Sessions</h1>
          <button className="new-chat-button" onClick={handleNewChat}>
            + New Chat
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {sessions.length === 0 ? (
          <div className="empty-state">
            <p>No chat sessions yet. Start a new conversation!</p>
            <button className="new-chat-button-primary" onClick={handleNewChat}>
              Start New Chat
            </button>
          </div>
        ) : (
          <div className="sessions-table-container">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Last Updated</th>
                  <th>Messages</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.session_id}
                    className="session-row"
                    onClick={() => handleSessionClick(session.session_id)}
                  >
                    <td className="session-title">{session.title}</td>
                    <td className="session-date">{formatDate(session.updated_at)}</td>
                    <td className="session-count">{session.message_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;


