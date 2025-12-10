import React, { useState, useRef, useEffect } from 'react';
import './LeftSidebar.css';
import { ReactComponent as ChatIcon } from '../../assets/chat-icon.svg';

const LeftSidebar = ({ onChatsClick, onChatsHoverStart, onChatsHoverEnd, onLogout, currentProjectName, onChangeProject, isChatActive = false }) => {
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
    };

    if (showAccountMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAccountMenu]);

  const handleAccountClick = () => {
    setShowAccountMenu(!showAccountMenu);
  };

  const handleLogoutClick = () => {
    setShowAccountMenu(false);
    onLogout();
  };

  const handleChangeProjectClick = () => {
    setShowAccountMenu(false);
    onChangeProject();
  };

  return (
    <div className="left-sidebar">
      <div className="sidebar-top">
        <button 
          className={`sidebar-button ${isChatActive ? 'active' : ''}`} 
          onClick={onChatsClick} 
          onMouseEnter={onChatsHoverStart}
          onMouseLeave={onChatsHoverEnd}
          title="Chats"
        >
          <ChatIcon className="sidebar-icon" />
        </button>
      </div>
      <div className="sidebar-bottom" ref={menuRef}>
        <button className="sidebar-button" onClick={handleAccountClick} title="My Account">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
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
  );
};

export default LeftSidebar;
