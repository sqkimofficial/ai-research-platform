import React, { useState, useEffect } from 'react';
import { chatAPI, projectAPI, highlightsAPI } from '../../services/api';
import ProjectSelector from '../ProjectSelector/ProjectSelector';
import './HomePage.css';

const HomePage = ({ onSelectSession, onCreateNewSession }) => {
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [highlights, setHighlights] = useState({});
  const [expandedProjects, setExpandedProjects] = useState({});
  const [expandedUrls, setExpandedUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showProjectSelector, setShowProjectSelector] = useState(false);

  useEffect(() => {
    if (activeTab === 'sessions') {
      loadSessions();
    } else {
      loadProjectsForHighlights();
    }
  }, [activeTab]);

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

  const loadProjectsForHighlights = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await projectAPI.getAllProjects();
      setProjects(response.data.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadHighlightsForProject = async (projectId) => {
    try {
      const response = await highlightsAPI.getHighlights(projectId);
      const projectHighlights = response.data.highlights || [];
      setHighlights(prev => ({
        ...prev,
        [projectId]: projectHighlights
      }));
    } catch (err) {
      console.error('Failed to load highlights:', err);
      setError('Failed to load highlights for this project.');
    }
  };

  const toggleProject = async (projectId) => {
    const isExpanded = expandedProjects[projectId];
    
    if (!isExpanded && !highlights[projectId]) {
      // Load highlights when expanding for the first time
      await loadHighlightsForProject(projectId);
    }
    
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !isExpanded
    }));
    
    // Collapse all URLs when collapsing project
    if (isExpanded) {
      setExpandedUrls(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(key => {
          if (key.startsWith(projectId)) {
            delete newState[key];
          }
        });
        return newState;
      });
    }
  };

  const toggleUrl = (projectId, urlIndex) => {
    const key = `${projectId}-${urlIndex}`;
    setExpandedUrls(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Helper to parse UTC date string - browser automatically converts to local timezone
  // Returns null if dateString is invalid or missing (never returns current time)
  const parseUTCDate = (dateString) => {
    if (!dateString) return null;
    let dateStr = String(dateString).trim();
    if (!dateStr || dateStr === 'undefined' || dateStr === 'null') return null;
    
    // If date string doesn't have timezone info and is ISO format, treat as UTC
    if (dateStr.includes('T') && !dateStr.endsWith('Z') && 
        !/[+-]\d{2}:\d{2}$/.test(dateStr) && !/[+-]\d{4}$/.test(dateStr)) {
      dateStr = dateStr + 'Z';
    }
    
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (dateString) => {
    // Use browser's native date/time formatting
    const date = parseUTCDate(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (dateString) => {
    // Use browser's native date/time formatting
    const date = parseUTCDate(dateString);
    if (!date) return '—'; // Return placeholder if no valid date
    
    const now = new Date();
    
    // Get today's date in local timezone (browser handles this automatically)
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    
    // Get item's date in local timezone (browser handles this automatically)
    const itemYear = date.getFullYear();
    const itemMonth = date.getMonth();
    const itemDay = date.getDate();
    
    // If it's not today, show date in format "7 Jan, 2026"
    if (itemYear !== todayYear || itemMonth !== todayMonth || itemDay !== todayDay) {
      // Format as "7 Jan, 2026" using browser's local timezone values
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = date.getDate(); // Browser automatically converts to local timezone
      const month = months[date.getMonth()]; // Browser automatically converts to local timezone
      const year = date.getFullYear(); // Browser automatically converts to local timezone
      return `${day} ${month}, ${year}`;
    }
    
    // Otherwise show time using browser's native time formatting
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    return date.toLocaleTimeString('en-US', options);
  };

  const truncateUrl = (url, maxLength = 60) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  const truncateText = (text, maxLength = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const handleSessionClick = (sessionId) => {
    onSelectSession(sessionId);
  };

  const handleNewChat = () => {
    setShowProjectSelector(true);
  };

  const handleProjectSelected = async (projectId) => {
    try {
      setShowProjectSelector(false);
      const response = await chatAPI.createSession(projectId);
      onSelectSession(response.data.session_id);
    } catch (err) {
      console.error('Failed to create new session:', err);
      setError('Failed to create new chat session. Please try again.');
    }
  };

  const handleCloseProjectSelector = () => {
    setShowProjectSelector(false);
  };

  const handleDeleteHighlight = async (projectId, sourceUrl, highlightId) => {
    if (!window.confirm('Are you sure you want to delete this highlight?')) {
      return;
    }
    
    try {
      await highlightsAPI.deleteHighlight(projectId, sourceUrl, highlightId);
      // Reload highlights for this project
      await loadHighlightsForProject(projectId);
    } catch (err) {
      console.error('Failed to delete highlight:', err);
      setError('Failed to delete highlight. Please try again.');
    }
  };

  const renderSessionsTab = () => {
    if (sessions.length === 0) {
      return (
        <div className="empty-state">
          <p>No chat sessions yet. Start a new conversation!</p>
          <button className="new-chat-button-primary" onClick={handleNewChat}>
            Start New Chat
          </button>
        </div>
      );
    }

    return (
      <div className="sessions-table-container">
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Project</th>
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
                <td className="session-project">{session.project_name || 'Unknown'}</td>
                <td className="session-date">{formatDate(session.updated_at)}</td>
                <td className="session-count">{session.message_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderHighlightsTab = () => {
    if (projects.length === 0) {
      return (
        <div className="empty-state">
          <p>No projects yet. Create a project to start saving highlights!</p>
        </div>
      );
    }

    return (
      <div className="highlights-table-container">
        <table className="highlights-table">
          <thead>
            <tr>
              <th></th>
              <th>Project / URL / Highlight</th>
              <th>Details</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <React.Fragment key={project.project_id}>
                {/* Project Row */}
                <tr 
                  className={`project-row ${expandedProjects[project.project_id] ? 'expanded' : ''}`}
                  onClick={() => toggleProject(project.project_id)}
                >
                  <td className="expand-cell">
                    <span className={`expand-icon ${expandedProjects[project.project_id] ? 'expanded' : ''}`}>
                      ▶
                    </span>
                  </td>
                  <td className="project-name">
                    <span className="project-icon">📁</span>
                    {project.project_name}
                  </td>
                  <td className="project-description">{project.description || '—'}</td>
                  <td className="project-date">{formatShortDate(project.updated_at)}</td>
                  <td></td>
                </tr>

                {/* URL Rows (when project is expanded) */}
                {expandedProjects[project.project_id] && highlights[project.project_id] && (
                  highlights[project.project_id].length === 0 ? (
                    <tr className="url-row no-highlights">
                      <td></td>
                      <td colSpan="4" className="no-highlights-message">
                        No highlights saved for this project yet
                      </td>
                    </tr>
                  ) : (
                    highlights[project.project_id].map((urlDoc, urlIndex) => (
                      <React.Fragment key={`${project.project_id}-url-${urlIndex}`}>
                        {/* URL Row */}
                        <tr 
                          className={`url-row ${expandedUrls[`${project.project_id}-${urlIndex}`] ? 'expanded' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleUrl(project.project_id, urlIndex);
                          }}
                        >
                          <td className="expand-cell">
                            <span className={`expand-icon ${expandedUrls[`${project.project_id}-${urlIndex}`] ? 'expanded' : ''}`}>
                              ▶
                            </span>
                          </td>
                          <td className="url-cell">
                            <span className="url-icon">🔗</span>
                            <div className="url-info">
                              <span className="url-title">{urlDoc.page_title || 'Untitled Page'}</span>
                              <span className="url-text">{truncateUrl(urlDoc.source_url)}</span>
                            </div>
                          </td>
                          <td className="highlight-count">
                            {urlDoc.highlights?.length || 0} highlight{(urlDoc.highlights?.length || 0) !== 1 ? 's' : ''}
                          </td>
                          <td className="url-date">{formatShortDate(urlDoc.updated_at)}</td>
                          <td></td>
                        </tr>

                        {/* Highlight Rows (when URL is expanded) */}
                        {expandedUrls[`${project.project_id}-${urlIndex}`] && urlDoc.highlights && (
                          urlDoc.highlights.map((highlight, hIndex) => (
                            <tr 
                              key={`${project.project_id}-${urlIndex}-highlight-${hIndex}`}
                              className="highlight-row"
                            >
                              <td></td>
                              <td className="highlight-cell">
                                <span className="highlight-icon">✨</span>
                                <div className="highlight-content">
                                  <p className="highlight-text">"{truncateText(highlight.text)}"</p>
                                  {highlight.note && (
                                    <p className="highlight-note">
                                      <span className="note-label">Note:</span> {highlight.note}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="highlight-tags">
                                {highlight.tags && highlight.tags.length > 0 && (
                                  <div className="tags">
                                    {highlight.tags.map((tag, tIndex) => (
                                      <span key={tIndex} className="tag">{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="highlight-date">{formatShortDate(highlight.timestamp)}</td>
                              <td className="highlight-actions">
                                <button 
                                  className="delete-highlight-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteHighlight(project.project_id, urlDoc.source_url, highlight.highlight_id);
                                  }}
                                  title="Delete highlight"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </React.Fragment>
                    ))
                  )
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="homepage-container">
        <div className="homepage-content">
          <div className="loading-state">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="homepage-container">
      <div className="homepage-content">
        <div className="homepage-header">
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'sessions' ? 'active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              Chat Sessions
            </button>
            <button 
              className={`tab ${activeTab === 'highlights' ? 'active' : ''}`}
              onClick={() => setActiveTab('highlights')}
            >
              Highlights
            </button>
          </div>
          {activeTab === 'sessions' && (
            <button className="new-chat-button" onClick={handleNewChat}>
              + New Chat
            </button>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}

        {activeTab === 'sessions' ? renderSessionsTab() : renderHighlightsTab()}
      </div>

      {showProjectSelector && (
        <ProjectSelector
          onSelectProject={handleProjectSelected}
          onClose={handleCloseProjectSelector}
        />
      )}
    </div>
  );
};

export default HomePage;
