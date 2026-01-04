import React, { useState, useEffect, useRef } from 'react';
import editIcon from '../../assets/edit-icon.svg';
import archiveIcon from '../../assets/archive-icon.svg';
import menuIcon from '../../assets/document-menu-icons/More_Horizontal.svg';
import './DocumentPanel.css';

const DocumentCardMenu = ({ 
  documentId, 
  isArchived, 
  onRename, 
  onArchive, 
  onUnarchive,
  position = { top: '7px', right: '6.89px' }
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current && 
        buttonRef.current &&
        !menuRef.current.contains(event.target) &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleRename = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    onRename?.();
  };

  const handleArchive = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    if (isArchived) {
      onUnarchive?.();
    } else {
      onArchive?.();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        className="document-card-menu-button"
        onClick={handleMenuClick}
        style={{ top: position.top, right: position.right }}
        aria-label="Document menu"
      >
        <img src={menuIcon} alt="Menu" className="document-card-menu-icon" />
      </button>
      {isOpen && (
        <div 
          ref={menuRef}
          className="document-card-menu-dropdown"
          style={{ 
            top: `calc(${position.top} + 28px + 4px)`, 
            right: position.right 
          }}
        >
          <button 
            className="document-card-menu-item"
            onClick={handleRename}
          >
            <img src={editIcon} alt="Rename" className="document-card-menu-item-icon" />
            <span className="document-card-menu-item-text">Rename</span>
          </button>
          <button 
            className={`document-card-menu-item ${isArchived ? '' : 'archive-item'}`}
            onClick={handleArchive}
          >
            <img 
              src={archiveIcon} 
              alt="Archive" 
              className={`document-card-menu-item-icon ${isArchived ? '' : 'archive-icon'}`}
            />
            <span className={`document-card-menu-item-text ${isArchived ? '' : 'archive-text'}`}>
              {isArchived ? 'Unarchive' : 'Archive'}
            </span>
          </button>
        </div>
      )}
    </>
  );
};

export default DocumentCardMenu;

