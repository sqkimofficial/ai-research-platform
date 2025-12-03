import React, { useState, useEffect } from 'react';
import { documentAPI, chatAPI, projectAPI, highlightsAPI } from '../../services/api';
import { getSessionId, getToken } from '../../utils/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import SectionSelector from './SectionSelector';
import './DocumentPanel.css';

const DocumentPanel = ({ refreshTrigger, onAttachSections, onActiveDocumentChange, highlightsTabTrigger }) => {
  const [documents, setDocuments] = useState([]); // All open documents
  const [activeDocumentId, setActiveDocumentId] = useState(null); // Currently active tab
  const [content, setContent] = useState('');
  const [structure, setStructure] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSectionSelector, setShowSectionSelector] = useState(false);
  const [selectedSections, setSelectedSections] = useState([]);
  const [showDocumentList, setShowDocumentList] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [allDocumentsByProject, setAllDocumentsByProject] = useState({}); // { projectId: { projectName, documents: [] } }
  const [viewAllMode, setViewAllMode] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState({}); // { projectId: true/false }
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [activeTabId, setActiveTabId] = useState(null); // Can be document_id or highlights_tab_id
  const [activeTabType, setActiveTabType] = useState('document'); // 'document' or 'highlights'
  const [highlightsTabs, setHighlightsTabs] = useState([]); // Array of { id, selectedUrlData }
  const [highlightsProjects, setHighlightsProjects] = useState([]);
  const [highlightsData, setHighlightsData] = useState({});
  const [expandedHighlightsProjects, setExpandedHighlightsProjects] = useState({});
  const [highlightsLoading, setHighlightsLoading] = useState(false);

  // Get project_id from session
  useEffect(() => {
    const loadProjectFromSession = async () => {
      const sessionId = getSessionId();
      if (!sessionId) return;
      
      try {
        const response = await chatAPI.getSession(sessionId);
        const projectId = response.data.project_id;
        const projectName = response.data.project_name;
        if (projectId) {
          setSelectedProjectId(projectId);
          setCurrentProjectName(projectName);
          await loadAvailableDocuments(projectId);
        }
      } catch (err) {
        console.error('Failed to load project from session:', err);
      }
    };
    
    loadProjectFromSession();
  }, []);

  // Show document list when no documents are open
  useEffect(() => {
    if (documents.length === 0 && selectedProjectId) {
      setShowDocumentList(true);
    }
  }, [documents.length, selectedProjectId]);

  // Load available documents for the project
  const loadAvailableDocuments = async (projectId) => {
    try {
      const response = await documentAPI.getAllResearchDocuments(projectId);
      setAvailableDocuments(response.data.documents || []);
      setError(''); // Clear any previous errors
    } catch (err) {
      console.error('Failed to load available documents:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load documents';
      setError(errorMessage);
    }
  };

  // Load all documents from all projects
  const loadAllDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Ensure projects are loaded first
      if (projects.length === 0) {
        const projectsResponse = await projectAPI.getAllProjects();
        const projectsList = projectsResponse.data.projects || [];
        setProjects(projectsList);
      }
      
      // Fetch all documents (no project filter)
      const response = await documentAPI.getAllResearchDocuments();
      const allDocs = response.data.documents || [];
      
      // Group documents by project
      const grouped = {};
      const projectMap = {}; // Map project_id to project_name
      
      // Use current projects state or fetch if needed
      const projectsToUse = projects.length > 0 ? projects : (await projectAPI.getAllProjects()).data.projects || [];
      
      // Create project map from projects list
      projectsToUse.forEach(project => {
        projectMap[project.project_id] = project.project_name;
      });
      
      // Group documents
      allDocs.forEach(doc => {
        const projectId = doc.project_id;
        if (!grouped[projectId]) {
          grouped[projectId] = {
            projectName: projectMap[projectId] || 'Unknown Project',
            documents: []
          };
        }
        grouped[projectId].documents.push(doc);
      });
      
      // Sort documents within each project by updated_at (newest first)
      Object.keys(grouped).forEach(projectId => {
        grouped[projectId].documents.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at || 0);
          const dateB = new Date(b.updated_at || b.created_at || 0);
          return dateB - dateA;
        });
      });
      
      setAllDocumentsByProject(grouped);
      
      // Expand current project by default
      if (selectedProjectId && grouped[selectedProjectId]) {
        setExpandedProjects({ [selectedProjectId]: true });
      } else if (Object.keys(grouped).length > 0) {
        // Expand first project if current project has no documents
        const firstProjectId = Object.keys(grouped)[0];
        setExpandedProjects({ [firstProjectId]: true });
      }
    } catch (err) {
      console.error('Failed to load all documents:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load documents';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAll = async () => {
    setViewAllMode(true);
    await loadAllDocuments();
  };

  const handleViewCurrentProject = () => {
    setViewAllMode(false);
  };

  const toggleProject = (projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // Load projects for document creation
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await projectAPI.getAllProjects();
        setProjects(response.data.projects || []);
      } catch (err) {
        console.error('Failed to load projects:', err);
      }
    };
    loadProjects();
  }, []);

  // Create new highlights tab when trigger changes
  useEffect(() => {
    if (highlightsTabTrigger > 0) {
      const newTabId = `highlights-${Date.now()}`;
      const newTab = { id: newTabId, selectedUrlData: null };
      setHighlightsTabs(prev => [...prev, newTab]);
      setActiveTabId(newTabId);
      setActiveTabType('highlights');
      loadHighlightsProjects();
    }
  }, [highlightsTabTrigger]);

  // Load projects for highlights
  const loadHighlightsProjects = async () => {
    try {
      setHighlightsLoading(true);
      const response = await projectAPI.getAllProjects();
      setHighlightsProjects(response.data.projects || []);
    } catch (err) {
      console.error('Failed to load projects for highlights:', err);
      setError('Failed to load projects for highlights.');
    } finally {
      setHighlightsLoading(false);
    }
  };

  // Load highlights for a project
  const loadHighlightsForProject = async (projectId) => {
    try {
      const response = await highlightsAPI.getHighlights(projectId);
      const projectHighlights = response.data.highlights || [];
      setHighlightsData(prev => ({
        ...prev,
        [projectId]: projectHighlights
      }));
    } catch (err) {
      console.error('Failed to load highlights:', err);
      setError('Failed to load highlights for this project.');
    }
  };

  const toggleHighlightsProject = async (projectId) => {
    const isExpanded = expandedHighlightsProjects[projectId];
    
    if (!isExpanded && !highlightsData[projectId]) {
      await loadHighlightsForProject(projectId);
    }
    
    setExpandedHighlightsProjects(prev => ({
      ...prev,
      [projectId]: !isExpanded
    }));
  };

  const handleUrlClick = (projectId, urlDoc) => {
    const selectedData = {
      projectId,
      urlDoc,
      highlights: urlDoc.highlights || []
    };
    // Update the selectedUrlData for the active highlights tab
    setHighlightsTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, selectedUrlData: selectedData } : tab
    ));
  };

  const handleBackToTable = () => {
    // Clear selectedUrlData for the active highlights tab
    setHighlightsTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, selectedUrlData: null } : tab
    ));
  };

  // Get active highlights tab data
  const getActiveHighlightsTab = () => {
    return highlightsTabs.find(tab => tab.id === activeTabId);
  };

  // Get selected URL data for the active highlights tab
  const getSelectedUrlData = () => {
    const activeTab = getActiveHighlightsTab();
    return activeTab?.selectedUrlData || null;
  };

  const formatShortDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateUrl = (url, maxLength = 60) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  const truncateText = (text, maxLength = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const handleDeleteHighlight = async (projectId, sourceUrl, highlightId) => {
    if (!window.confirm('Are you sure you want to delete this highlight?')) {
      return;
    }
    
    try {
      await highlightsAPI.deleteHighlight(projectId, sourceUrl, highlightId);
      await loadHighlightsForProject(projectId);
      
      // Update selected URL data in any highlights tabs that are viewing this URL
      setHighlightsTabs(prev => prev.map(tab => {
        if (tab.selectedUrlData && 
            tab.selectedUrlData.projectId === projectId && 
            tab.selectedUrlData.urlDoc.source_url === sourceUrl) {
          const updatedHighlights = tab.selectedUrlData.highlights.filter(h => h.highlight_id !== highlightId);
          return {
            ...tab,
            selectedUrlData: {
              ...tab.selectedUrlData,
              highlights: updatedHighlights,
              urlDoc: {
                ...tab.selectedUrlData.urlDoc,
                highlights: updatedHighlights
              }
            }
          };
        }
        return tab;
      }));
    } catch (err) {
      console.error('Failed to delete highlight:', err);
      setError('Failed to delete highlight. Please try again.');
    }
  };

  // Notify parent of active document change
  useEffect(() => {
    if (onActiveDocumentChange) {
      onActiveDocumentChange(activeDocumentId);
    }
  }, [activeDocumentId, onActiveDocumentChange]);

  const fetchDocument = async (documentId) => {
    if (!documentId) {
      setContent('');
      setStructure([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await documentAPI.getDocument(null, documentId);
      const markdownContent = response.data.content || '';
      const documentStructure = response.data.structure || [];
      setContent(markdownContent);
      setStructure(documentStructure);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load document';
      setError(errorMessage);
      console.error('Failed to fetch document:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch active document when it changes
  useEffect(() => {
    if (activeDocumentId) {
      fetchDocument(activeDocumentId);
    } else {
      setContent('');
      setStructure([]);
    }
  }, [activeDocumentId]);

  // Auto-refresh when refreshTrigger changes (new AI message)
  useEffect(() => {
    if (refreshTrigger > 0 && activeDocumentId) {
      setTimeout(() => {
        fetchDocument(activeDocumentId);
      }, 1000);
    }
  }, [refreshTrigger, activeDocumentId]);

  const handleRefresh = () => {
    if (activeDocumentId) {
      fetchDocument(activeDocumentId);
    }
  };

  const handleSelectionChange = (selectedIds) => {
    setSelectedSections(selectedIds);
  };

  const handleAttachSections = () => {
    if (selectedSections.length === 0) {
      setError('Please select at least one section to attach');
      return;
    }
    
    // Get selected structure elements
    const selectedElements = structure.filter(elem => 
      selectedSections.includes(elem.id)
    );
    
    if (onAttachSections) {
      onAttachSections(selectedElements);
      setShowSectionSelector(false);
      setSelectedSections([]);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!activeDocumentId) {
      setError('No active document');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await documentAPI.saveDocument(null, content, 'replace', activeDocumentId, structure);
      setIsEditing(false);
      await fetchDocument(activeDocumentId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save document');
      console.error('Failed to save document:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reload original content
    if (activeDocumentId) {
      fetchDocument(activeDocumentId);
    }
  };

  const handleAddDocument = () => {
    setShowDocumentList(!showDocumentList);
    if (!showDocumentList && selectedProjectId) {
      loadAvailableDocuments(selectedProjectId);
    }
  };

  const handleCreateNewDocument = async () => {
    if (!selectedProjectId) {
      setError('Please wait for project to load...');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const title = newDocumentTitle.trim() || undefined;
      const response = await documentAPI.createResearchDocument(selectedProjectId, title);
      const newDocId = response.data.document_id;
      
      // Add to documents list
      const newDoc = {
        document_id: newDocId,
        title: title || `Research Document ${new Date().toLocaleString()}`,
        project_id: selectedProjectId
      };
      
      setDocuments([...documents, newDoc]);
      setActiveDocumentId(newDocId);
      setShowDocumentList(false);
      setNewDocumentTitle('');
      
      // Reload available documents
      await loadAvailableDocuments(selectedProjectId);
      
      // If in view all mode, reload all documents too
      if (viewAllMode) {
        await loadAllDocuments();
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create document';
      setError(errorMessage);
      console.error('Failed to create document:', err);
      console.error('Error details:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExistingDocument = (documentId) => {
    // Check if document is already open
    const existingDoc = documents.find(doc => doc.document_id === documentId);
    if (existingDoc) {
      setActiveDocumentId(documentId);
    } else {
      // Add to open documents
      const doc = availableDocuments.find(d => d.document_id === documentId);
      if (doc) {
        setDocuments([...documents, doc]);
        setActiveDocumentId(documentId);
      }
    }
    setShowDocumentList(false);
    setError('');
  };

  const handleCloseTab = (documentId, e) => {
    e.stopPropagation();
    const newDocuments = documents.filter(doc => doc.document_id !== documentId);
    setDocuments(newDocuments);
    
    // If closing active tab, switch to another or clear
    if (documentId === activeDocumentId) {
      if (newDocuments.length > 0) {
        setActiveDocumentId(newDocuments[0].document_id);
      } else {
        setActiveDocumentId(null);
        // Show document list when all tabs are closed
        setShowDocumentList(true);
      }
    }
  };

  const handleCloseHighlightsTab = (tabId, e) => {
    e.stopPropagation();
    const newHighlightsTabs = highlightsTabs.filter(tab => tab.id !== tabId);
    setHighlightsTabs(newHighlightsTabs);
    
    // If closing active tab, switch to another or go to document
    if (tabId === activeTabId) {
      if (newHighlightsTabs.length > 0) {
        setActiveTabId(newHighlightsTabs[0].id);
        setActiveTabType('highlights');
      } else if (documents.length > 0) {
        setActiveTabId(activeDocumentId || documents[0].document_id);
        setActiveTabType('document');
        if (!activeDocumentId) {
          setActiveDocumentId(documents[0].document_id);
        }
      } else {
        setActiveTabId(null);
        setActiveTabType('document');
        setShowDocumentList(true);
      }
    }
  };

  const handleHighlightsTabClick = (tabId) => {
    setActiveTabId(tabId);
    setActiveTabType('highlights');
    if (highlightsProjects.length === 0) {
      loadHighlightsProjects();
    }
  };

  const handleDocumentTabClick = (documentId) => {
    setActiveTabId(documentId);
    setActiveTabType('document');
    setActiveDocumentId(documentId);
  };

  const getActiveDocument = () => {
    return documents.find(doc => doc.document_id === activeDocumentId);
  };

  return (
    <div className="document-panel">
      <div className="document-panel-header">
        <h2>Research Output</h2>
        <div className="document-actions">
          {!isEditing ? (
            <>
              {structure.length > 0 && (
                <button 
                  onClick={() => setShowSectionSelector(!showSectionSelector)} 
                  className="attach-button"
                  disabled={loading}
                  title="Select sections to attach to chat"
                >
                  {showSectionSelector ? 'Hide' : 'Attach Sections'}
                </button>
              )}
              <button 
                onClick={handleEdit} 
                className="edit-button"
                disabled={loading || !activeDocumentId}
              >
                Edit
              </button>
              <button 
                onClick={handleRefresh} 
                className="refresh-button"
                disabled={loading || !activeDocumentId}
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={handleSave} 
                className="save-button"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button 
                onClick={handleCancel} 
                className="cancel-button"
                disabled={loading}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Tab Bar */}
      <div className="document-tabs">
        {/* Document tabs */}
        {documents.map((doc) => (
          <div
            key={doc.document_id}
            className={`document-tab ${activeTabType === 'document' && doc.document_id === activeDocumentId ? 'active' : ''}`}
            onClick={() => handleDocumentTabClick(doc.document_id)}
          >
            <span className="tab-title">{doc.title || 'Untitled'}</span>
            <button
              className="tab-close-button"
              onClick={(e) => handleCloseTab(doc.document_id, e)}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
        {/* Highlights tabs */}
        {highlightsTabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`document-tab highlights-tab ${activeTabType === 'highlights' && activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => handleHighlightsTabClick(tab.id)}
          >
            <span className="tab-title">
              <span className="highlights-tab-icon">✨</span> Highlights {highlightsTabs.length > 1 ? index + 1 : ''}
            </span>
            <button
              className="tab-close-button"
              onClick={(e) => handleCloseHighlightsTab(tab.id, e)}
              title="Close highlights tab"
            >
              ×
            </button>
          </div>
        ))}
        {/* Add document button - always visible */}
        <button
          className="document-tab add-tab-button"
          onClick={handleAddDocument}
          title="Add document"
        >
          + Add
        </button>
      </div>

      <div className="document-content">
        {error && <div className="error-message">{error}</div>}
        
        {/* Highlights Tab Content */}
        {activeTabType === 'highlights' && (
          <div className="highlights-content">
            {getSelectedUrlData() ? (
                /* Split View: Web View (70%) + Highlights List (30%) */
                <div className="highlights-split-view">
                  <div className="highlights-web-view-section">
                    <div className="highlights-web-view-header">
                      <button 
                        className="back-to-table-button"
                        onClick={handleBackToTable}
                        title="Back to table"
                      >
                        ← Back
                      </button>
                      <div className="url-info-header">
                        <span className="url-title-header">{getSelectedUrlData().urlDoc.page_title || 'Untitled Page'}</span>
                        <span className="url-text-header">{getSelectedUrlData().urlDoc.source_url}</span>
                      </div>
                    </div>
                    <iframe
                      src={getSelectedUrlData().urlDoc.source_url}
                      className="highlights-iframe"
                      title="Web view"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>
                  <div className="highlights-list-section">
                    <div className="highlights-list-header">
                      <h3>Highlights ({getSelectedUrlData().highlights.length})</h3>
                    </div>
                    <div className="highlights-list-content">
                      {getSelectedUrlData().highlights.length === 0 ? (
                        <div className="no-highlights-message-list">
                          <p>No highlights saved for this URL yet.</p>
                        </div>
                      ) : (
                        getSelectedUrlData().highlights.map((highlight, hIndex) => (
                          <div key={hIndex} className="highlight-item">
                            <div className="highlight-item-header">
                              <span className="highlight-item-icon">✨</span>
                              <span className="highlight-item-date">{formatShortDate(highlight.timestamp)}</span>
                              <button 
                                className="delete-highlight-btn-item"
                                onClick={() => handleDeleteHighlight(getSelectedUrlData().projectId, getSelectedUrlData().urlDoc.source_url, highlight.highlight_id)}
                                title="Delete highlight"
                              >
                                🗑️
                              </button>
                            </div>
                            <div className="highlight-item-content">
                              <p className="highlight-item-text">"{highlight.text}"</p>
                              {highlight.note && (
                                <div className="highlight-item-note">
                                  <span className="note-label">Note:</span> {highlight.note}
                                </div>
                              )}
                              {highlight.tags && highlight.tags.length > 0 && (
                                <div className="highlight-item-tags">
                                  {highlight.tags.map((tag, tIndex) => (
                                    <span key={tIndex} className="tag">{tag}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
              /* Table View: Projects and URLs */
              highlightsLoading ? (
                <div className="loading-message">Loading highlights...</div>
              ) : highlightsProjects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects yet. Create a project to start saving highlights!</p>
                </div>
              ) : (
                <div className="highlights-table-container">
                  <table className="highlights-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Project / URL</th>
                        <th>Highlights Count</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {highlightsProjects.map((project) => (
                        <React.Fragment key={project.project_id}>
                          {/* Project Row */}
                          <tr 
                            className={`project-row ${expandedHighlightsProjects[project.project_id] ? 'expanded' : ''}`}
                            onClick={() => toggleHighlightsProject(project.project_id)}
                          >
                            <td className="expand-cell">
                              <span className={`expand-icon ${expandedHighlightsProjects[project.project_id] ? 'expanded' : ''}`}>
                                ▶
                              </span>
                            </td>
                            <td className="project-name">
                              <span className="project-icon">📁</span>
                              {project.project_name}
                            </td>
                            <td className="project-description">{project.description || '—'}</td>
                            <td className="project-date">{formatShortDate(project.updated_at)}</td>
                          </tr>

                          {/* URL Rows (when project is expanded) */}
                          {expandedHighlightsProjects[project.project_id] && highlightsData[project.project_id] && (
                            highlightsData[project.project_id].length === 0 ? (
                              <tr className="url-row no-highlights">
                                <td></td>
                                <td colSpan="3" className="no-highlights-message">
                                  No highlights saved for this project yet
                                </td>
                              </tr>
                            ) : (
                              highlightsData[project.project_id].map((urlDoc, urlIndex) => (
                                <tr 
                                  key={`${project.project_id}-url-${urlIndex}`}
                                  className="url-row clickable-url-row"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUrlClick(project.project_id, urlDoc);
                                  }}
                                >
                                  <td className="expand-cell"></td>
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
                                </tr>
                              ))
                            )
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}

        {/* Document Tab Content */}
        {activeTabType === 'document' && (
          <>
            {loading && !content && activeDocumentId && (
              <div className="loading-message">Loading document...</div>
            )}
            
            {/* Show document list/create UI when no document is active or when showDocumentList is true */}
            {(!activeDocumentId || showDocumentList) && (
              <div className="document-list-view">
            <div className="document-list-header-inline">
              <h3>Select or Create Document</h3>
              {activeDocumentId && (
                <button
                  className="close-list-button"
                  onClick={() => setShowDocumentList(false)}
                >
                  × Close
                </button>
              )}
            </div>
            
            <div className="document-list-content-inline">
              {/* Create New Document */}
              <div className="create-document-section">
                <h4>Create New Document</h4>
                <div className="create-document-form">
                  <input
                    type="text"
                    placeholder="Document title (optional)"
                    value={newDocumentTitle}
                    onChange={(e) => setNewDocumentTitle(e.target.value)}
                    className="document-title-input"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && selectedProjectId) {
                        handleCreateNewDocument();
                      }
                    }}
                  />
                  <button
                    onClick={handleCreateNewDocument}
                    className="create-document-button"
                    disabled={!selectedProjectId}
                  >
                    Create New
                  </button>
                </div>
                {!selectedProjectId && (
                  <p className="project-warning">Please wait for project to load...</p>
                )}
              </div>

              {/* Existing Documents */}
              <div className="existing-documents-section">
                <div className="existing-documents-header">
                  <h4>Existing Documents</h4>
                  {!viewAllMode && (
                    <button
                      className="view-all-button"
                      onClick={handleViewAll}
                      disabled={loading}
                    >
                      View All
                    </button>
                  )}
                  {viewAllMode && (
                    <button
                      className="view-current-button"
                      onClick={handleViewCurrentProject}
                    >
                      View Current Project
                    </button>
                  )}
                </div>
                
                {!viewAllMode ? (
                  // Show current project documents
                  availableDocuments.length === 0 ? (
                    <div className="no-documents-section">
                      <p className="no-documents">No documents in this project.</p>
                    </div>
                  ) : (
                    <div className="document-list">
                      {availableDocuments.map((doc) => (
                        <div
                          key={doc.document_id}
                          className="document-list-item"
                          onClick={() => handleSelectExistingDocument(doc.document_id)}
                        >
                          <div className="document-list-item-title">{doc.title || 'Untitled'}</div>
                          <div className="document-list-item-date">
                            {doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  // Show all documents grouped by project
                  Object.keys(allDocumentsByProject).length === 0 ? (
                    <p className="no-documents">No documents found.</p>
                  ) : (
                    <div className="projects-document-list">
                      {Object.entries(allDocumentsByProject).map(([projectId, projectData]) => (
                        <div key={projectId} className="project-documents-group">
                          <div
                            className="project-header"
                            onClick={() => toggleProject(projectId)}
                          >
                            <span className={`project-expand-icon ${expandedProjects[projectId] ? 'expanded' : ''}`}>
                              ▶
                            </span>
                            <span className="project-name">{projectData.projectName}</span>
                            <span className="project-doc-count">({projectData.documents.length})</span>
                          </div>
                          {expandedProjects[projectId] && (
                            <div className="project-documents-list">
                              {projectData.documents.map((doc) => (
                                <div
                                  key={doc.document_id}
                                  className="document-list-item"
                                  onClick={() => handleSelectExistingDocument(doc.document_id)}
                                >
                                  <div className="document-list-item-title">{doc.title || 'Untitled'}</div>
                          <div className="document-list-item-date">
                            {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 
                             doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : ''}
                          </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
            )}
            {!loading && !error && activeDocumentId && !showDocumentList && (
          <>
            {showSectionSelector && structure.length > 0 && (
              <div className="section-selector-container">
                <SectionSelector
                  structure={structure}
                  onSelectionChange={handleSelectionChange}
                />
                <div className="attach-actions">
                  <button
                    onClick={handleAttachSections}
                    className="attach-confirm-button"
                    disabled={selectedSections.length === 0}
                  >
                    Attach Selected ({selectedSections.length})
                  </button>
                  <button
                    onClick={() => {
                      setShowSectionSelector(false);
                      setSelectedSections([]);
                    }}
                    className="attach-cancel-button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {isEditing ? (
              <textarea
                className="document-editor"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  minHeight: '400px',
                  width: '100%',
                  padding: '20px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  outline: 'none',
                  fontFamily: 'Monaco, "Courier New", monospace',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  backgroundColor: '#f8f9fa',
                  resize: 'vertical'
                }}
              />
            ) : (
              <div className="document-preview markdown-body">
                {content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                  >
                    {content}
                  </ReactMarkdown>
                ) : (
                  <p>No content yet. Start a conversation to build your research document.</p>
                )}
              </div>
            )}
          </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentPanel;
