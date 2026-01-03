import React, { useState, useRef, useEffect } from 'react';
import './LeftSidebar.css';
import { ReactComponent as WebIcon } from '../../assets/web-icon.svg';
import { ReactComponent as PdfIcon } from '../../assets/pdf-icon.svg';
import { ReactComponent as DocumentIcon } from '../../assets/document-icon.svg';
import { ReactComponent as PlusIcon } from '../../assets/plus-icon.svg';
import { ReactComponent as CancelIcon } from '../../assets/cancel-icon.svg';
import { ReactComponent as DropdownIcon } from '../../assets/dropdown-icon.svg';
import { ReactComponent as StarIcon } from '../../assets/star.svg';
import { ReactComponent as StarToggledIcon } from '../../assets/star-toggled.svg';
import { ReactComponent as CheckIcon } from '../../assets/check-icon.svg';
import ProjectSelector from '../ProjectSelector/ProjectSelector';
import { projectAPI } from '../../services/api';

const LeftSidebar = ({ 
  onLogout, 
  currentProjectName, 
  onChangeProject, 
  onHighlightsClick, 
  onPDFsClick, 
  onResearchDocsClick,
  // Tab-related props from DocumentPanel
  tabOrder = [],
  documents = [],
  highlightsTabs = [],
  pdfTabs = [],
  researchDocsTabs = [],
  activeTabType = 'document',
  activeTabId = null,
  activeDocumentId = null,
  onTabClick = null,
  onCloseTab = null,
  onAddDocument = null,
  getFaviconUrl = null
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [hoverTimeout, setHoverTimeout] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const menuRef = useRef(null);
  const sidebarRef = useRef(null);
  const projectDropdownRef = useRef(null);

  // Get user first name from localStorage
  const getUserFirstName = () => {
    const firstName = localStorage.getItem('userFirstName');
    return firstName || 'A';
  };

  const userInitial = getUserFirstName().charAt(0).toUpperCase();

  // Handle hover to expand sidebar
  const handleMouseEnter = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    const timeout = setTimeout(() => {
      setIsExpanded(true);
    }, 500);
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setIsExpanded(false);
    setIsProjectDropdownOpen(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target)) {
        setIsProjectDropdownOpen(false);
      }
    };

    if (showAccountMenu || isProjectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAccountMenu, isProjectDropdownOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
    };
  }, [hoverTimeout]);

  const handleAccountClick = () => {
    setShowAccountMenu(!showAccountMenu);
  };

  const handleLogoutClick = () => {
    setShowAccountMenu(false);
    onLogout();
  };

  const handleChangeProjectClick = () => {
    setShowAccountMenu(false);
    setShowProjectSelector(true);
  };

  const handleSelectProject = (projectId, projectName) => {
    if (onChangeProject) {
      onChangeProject(projectId, projectName);
    }
    setCurrentProjectId(projectId);
    localStorage.setItem('selectedProjectId', projectId);
    setShowProjectSelector(false);
    setIsProjectDropdownOpen(false);
  };

  // Get current project ID from localStorage on mount
  useEffect(() => {
    const savedProjectId = localStorage.getItem('selectedProjectId');
    if (savedProjectId) {
      setCurrentProjectId(savedProjectId);
    }
  }, []);

  // Update current project ID when currentProjectName changes
  useEffect(() => {
    if (currentProjectName && projects.length > 0 && !currentProjectId) {
      const currentProject = projects.find(
        p => p.project_name === currentProjectName
      );
      if (currentProject) {
        setCurrentProjectId(currentProject.project_id);
      }
    }
  }, [currentProjectName, projects, currentProjectId]);

  // Load projects when dropdown opens
  useEffect(() => {
    if (isProjectDropdownOpen) {
      loadProjects();
    }
  }, [isProjectDropdownOpen]);

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const response = await projectAPI.getAllProjects();
      setProjects(response.data.projects || []);
      
      // Find current project ID from projects list if we have currentProjectName
      if (currentProjectName && !currentProjectId) {
        const currentProject = response.data.projects?.find(
          p => p.project_name === currentProjectName
        );
        if (currentProject) {
          setCurrentProjectId(currentProject.project_id);
        }
      }
      
      // Also check localStorage
      const savedProjectId = localStorage.getItem('selectedProjectId');
      if (savedProjectId && !currentProjectId) {
        setCurrentProjectId(savedProjectId);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleProjectDropdownClick = () => {
    setIsProjectDropdownOpen((prev) => !prev);
  };

  const handleProjectItemClick = (project) => {
    handleSelectProject(project.project_id, project.project_name);
  };

  const handleNewProjectClick = () => {
    setIsProjectDropdownOpen(false);
    setShowProjectSelector(true);
  };

  // Get tab title based on type
  const getTabTitle = (tabEntry) => {
    if (tabEntry.type === 'document') {
      const doc = documents.find(d => d.document_id === tabEntry.id);
      if (!doc) return null;
      if (doc.title && doc.title.trim()) return doc.title;
      const docIndex = documents.findIndex(d => d.document_id === doc.document_id);
      const untitledCount = documents.slice(0, docIndex + 1).filter(d => !d.title || !d.title.trim()).length;
      return untitledCount > 1 ? `Untitled ${untitledCount}` : 'Untitled';
    } else if (tabEntry.type === 'highlights') {
      const tab = highlightsTabs.find(t => t.id === tabEntry.id);
      if (!tab) return null;
      if (tab.selectedUrlData?.urlDoc?.page_title) {
        return tab.selectedUrlData.urlDoc.page_title;
      }
      const tabIndex = highlightsTabs.filter(t => !t.selectedUrlData?.urlDoc?.page_title).findIndex(t => t.id === tab.id);
      return tabIndex > 0 ? `Web Highlights ${tabIndex + 1}` : 'Web Highlights';
    } else if (tabEntry.type === 'pdf') {
      const tab = pdfTabs.find(t => t.id === tabEntry.id);
      if (!tab) return null;
      if (tab.selectedPdfData?.pdf?.filename) {
        return tab.selectedPdfData.pdf.filename;
      }
      const tabIndex = pdfTabs.filter(t => !t.selectedPdfData?.pdf?.filename).findIndex(t => t.id === tab.id);
      return tabIndex > 0 ? `Highlight Docs ${tabIndex + 1}` : 'Highlight Docs';
    } else if (tabEntry.type === 'researchdocs') {
      const tab = researchDocsTabs.find(t => t.id === tabEntry.id);
      if (!tab) return null;
      const researchTabIndex = researchDocsTabs.findIndex(t => t.id === tab.id);
      return researchDocsTabs.length > 1 ? `Research Docs ${researchTabIndex + 1}` : 'Research Docs';
    }
    return null;
  };

  // Get tab icon based on type
  const getTabIcon = (tabEntry) => {
    if (tabEntry.type === 'document') {
      return <DocumentIcon className="tab-icon" />;
    } else if (tabEntry.type === 'highlights') {
      const tab = highlightsTabs.find(t => t.id === tabEntry.id);
      if (tab?.selectedUrlData?.urlDoc?.source_url && getFaviconUrl) {
        const faviconUrl = getFaviconUrl(tab.selectedUrlData.urlDoc.source_url);
        return (
          <div className="favicon-container">
            <img src={faviconUrl} alt="" className="tab-icon favicon" />
          </div>
        );
      }
      return <WebIcon className="tab-icon" />;
    } else if (tabEntry.type === 'pdf') {
      return <PdfIcon className="tab-icon" />;
    } else if (tabEntry.type === 'researchdocs') {
      return <DocumentIcon className="tab-icon" />;
    }
    return null;
  };

  // Check if tab is active
  const isTabActive = (tabEntry) => {
    if (tabEntry.type === 'document') {
      return activeTabType === 'document' && tabEntry.id === activeDocumentId;
    } else {
      return activeTabType === tabEntry.type && tabEntry.id === activeTabId;
    }
  };

  // Get unique tab key for favorites
  const getTabKey = (tabEntry) => {
    return `${tabEntry.type}-${tabEntry.id}`;
  };

  // Check if tab is favorited
  const isFavorited = (tabEntry) => {
    return favorites.has(getTabKey(tabEntry));
  };

  // Toggle favorite
  const toggleFavorite = (e, tabEntry) => {
    e.stopPropagation();
    const key = getTabKey(tabEntry);
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(key)) {
        newFavorites.delete(key);
      } else {
        newFavorites.add(key);
      }
      return newFavorites;
    });
  };

  // Separate tabs into favorites and regular
  const favoriteTabs = tabOrder.filter(tab => isFavorited(tab));
  const regularTabs = tabOrder.filter(tab => !isFavorited(tab));

  if (showProjectSelector) {
    return (
      <ProjectSelector
        onSelectProject={handleSelectProject}
        onClose={() => setShowProjectSelector(false)}
        isRequired={false}
      />
    );
  }

  return (
    <>
      <div 
        className={`left-sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}
        ref={sidebarRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Top Section - Project Selector */}
        <div className="sidebar-top-section">
          <div className="project-selector-wrapper" ref={projectDropdownRef}>
            <div 
              className="project-selector-container"
              onClick={handleProjectDropdownClick}
            >
              <div className="project-icon-red"></div>
              {isExpanded && (
                <>
                  <div className="project-name-text">{currentProjectName || 'Select Project'}</div>
                  <DropdownIcon className="dropdown-icon" />
                </>
              )}
            </div>
            {isProjectDropdownOpen && isExpanded && (
              <div className="project-dropdown">
                <button
                  type="button"
                  className="project-new-button"
                  onClick={handleNewProjectClick}
                >
                  <PlusIcon className="project-new-icon" />
                  <span>New Project</span>
                </button>
                {projects.length > 0 && (
                  <div className="project-list">
                    {projects.map((project) => (
                      <button
                        key={project.project_id}
                        type="button"
                        className={`project-item ${currentProjectId === project.project_id ? 'active' : ''}`}
                        onClick={() => handleProjectItemClick(project)}
                      >
                        <span>{project.project_name}</span>
                        {currentProjectId === project.project_id && (
                          <CheckIcon className="project-check-icon" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Panel Buttons */}
          <div className="panel-buttons">
            <button 
              className={`panel-button ${activeTabType === 'researchdocs' ? 'active' : ''}`}
              onClick={onResearchDocsClick}
              title="Research Documents"
            >
              <DocumentIcon className="panel-icon" />
              {isExpanded && <span className="panel-label">Research Documents</span>}
            </button>
            <button 
              className={`panel-button ${activeTabType === 'highlights' ? 'active' : ''}`}
              onClick={onHighlightsClick}
              title="Web Highlights"
            >
              <WebIcon className="panel-icon" />
              {isExpanded && <span className="panel-label">Web Highlights</span>}
            </button>
            <button 
              className={`panel-button ${activeTabType === 'pdf' ? 'active' : ''}`}
              onClick={onPDFsClick}
              title="PDF Highlights"
            >
              <PdfIcon className="panel-icon" />
              {isExpanded && <span className="panel-label">PDF Highlights</span>}
            </button>
          </div>
        </div>

        {/* Middle Section - Scrollable Tabs */}
        <div className="sidebar-tabs-section">
          <button 
            className="new-tab-button"
            onClick={() => {
              if (onAddDocument) {
                onAddDocument();
              }
            }}
            title="New Tab"
            disabled={!onAddDocument}
          >
            <PlusIcon className="new-tab-icon" />
            {isExpanded && <span className="new-tab-text">New Tab</span>}
          </button>
          <div className="tabs-list">
            {/* Favourites Section - Always Visible */}
            <div className="favourites-section">
              <div className="favourites-header">
                <StarToggledIcon className="favourites-header-icon" />
                {isExpanded && <span className="favourites-header-text">Favourites</span>}
              </div>
              {favoriteTabs.length > 0 && (
                <div className="favourites-tabs">
                  {favoriteTabs.map((tabEntry) => {
                    const title = getTabTitle(tabEntry);
                    if (!title) return null;
                    const icon = getTabIcon(tabEntry);
                    const isActive = isTabActive(tabEntry);
                    const favorited = isFavorited(tabEntry);
                    
                    return (
                      <div
                        key={getTabKey(tabEntry)}
                        className={`sidebar-tab ${isActive ? 'active' : ''} ${favorited ? 'favorited' : ''}`}
                        onClick={() => onTabClick && onTabClick(tabEntry)}
                      >
                        {isExpanded ? (
                          <>
                            {icon}
                            <span className="tab-title-text">{title}</span>
                            <div className="tab-actions">
                              {isExpanded && (
                                <button
                                  className="tab-star-button"
                                  onClick={(e) => toggleFavorite(e, tabEntry)}
                                  title={favorited ? "Remove from favorites" : "Add to favorites"}
                                >
                                  {favorited ? (
                                    <StarToggledIcon className="star-icon" />
                                  ) : (
                                    <StarIcon className="star-icon" />
                                  )}
                                </button>
                              )}
                              {isExpanded && onCloseTab && (
                                <button
                                  className="tab-close-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCloseTab(tabEntry);
                                  }}
                                  title="Close tab"
                                >
                                  <CancelIcon className="close-icon" />
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          icon
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {regularTabs.length > 0 && <div className="tabs-separator"></div>}
            </div>
            
            {/* Regular Tabs */}
            {regularTabs.map((tabEntry) => {
              const title = getTabTitle(tabEntry);
              if (!title) return null;
              const icon = getTabIcon(tabEntry);
              const isActive = isTabActive(tabEntry);
              const favorited = isFavorited(tabEntry);
              
              return (
                <div
                  key={getTabKey(tabEntry)}
                  className={`sidebar-tab ${isActive ? 'active' : ''}`}
                  onClick={() => onTabClick && onTabClick(tabEntry)}
                >
                  {isExpanded ? (
                    <>
                      {icon}
                      <span className="tab-title-text">{title}</span>
                      <div className="tab-actions">
                        {isExpanded && (
                          <button
                            className="tab-star-button"
                            onClick={(e) => toggleFavorite(e, tabEntry)}
                            title={favorited ? "Remove from favorites" : "Add to favorites"}
                          >
                            {favorited ? (
                              <StarToggledIcon className="star-icon" />
                            ) : (
                              <StarIcon className="star-icon" />
                            )}
                          </button>
                        )}
                        {isExpanded && onCloseTab && (
                          <button
                            className="tab-close-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseTab(tabEntry);
                            }}
                            title="Close tab"
                          >
                            <CancelIcon className="close-icon" />
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    icon
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Section - Account */}
        <div className="sidebar-bottom-section" ref={menuRef}>
          <button 
            className="account-button"
            onClick={handleAccountClick}
            title="My Account"
          >
            <div className="account-circle">
              <span className="account-initial">{userInitial}</span>
            </div>
            {isExpanded && <span className="account-label">My Account</span>}
          </button>
          {showAccountMenu && (
            <div className="account-dropdown">
              {currentProjectName && (
                <div className="dropdown-project-info">
                  <span className="project-label">Current Project:</span>
                  <span className="project-name-display">{currentProjectName}</span>
                </div>
              )}
              <button className="dropdown-item" onClick={handleChangeProjectClick}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Change Project</span>
              </button>
              <button className="dropdown-item logout-item" onClick={handleLogoutClick}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default LeftSidebar;
