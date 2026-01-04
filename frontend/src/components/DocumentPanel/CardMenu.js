import React, { useState, useEffect, useRef } from 'react';
import editIcon from '../../assets/edit-icon.svg';
import archiveIcon from '../../assets/archive-icon.svg';
import menuIcon from '../../assets/document-menu-icons/More_Horizontal.svg';
import './DocumentPanel.css';

/**
 * Reusable CardMenu component for documents, URL highlights, and PDF highlights
 * 
 * @param {string} itemId - Unique identifier for the item
 * @param {boolean} isArchived - Whether the item is archived
 * @param {function} onRename - Callback for rename action
 * @param {function} onArchive - Callback for archive action
 * @param {function} onUnarchive - Callback for unarchive action
 * @param {object} position - Position object with top and right CSS values (default: { top: '7px', right: '6.56px' })
 */
const CardMenu = ({ 
  itemId, 
  isArchived, 
  onRename, 
  onArchive, 
  onUnarchive,
  position = { top: '7px', right: '6.56px' }
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
        className="card-menu-button"
        onClick={handleMenuClick}
        style={{ top: position.top, right: position.right }}
        aria-label="Card menu"
      >
        <img src={menuIcon} alt="Menu" className="card-menu-icon" />
      </button>
      {isOpen && (
        <div 
          ref={menuRef}
          className="card-menu-dropdown"
          style={{ 
            top: `calc(${position.top} + 28px + 4px)`, 
            right: position.right 
          }}
        >
          <button 
            className="card-menu-item"
            onClick={handleRename}
          >
            <img src={editIcon} alt="Rename" className="card-menu-item-icon" />
            <span className="card-menu-item-text">Rename</span>
          </button>
          <button 
            className={`card-menu-item ${isArchived ? '' : 'archive-item'}`}
            onClick={handleArchive}
          >
            <img 
              src={archiveIcon} 
              alt="Archive" 
              className={`card-menu-item-icon ${isArchived ? '' : 'archive-icon'}`}
            />
            <span className={`card-menu-item-text ${isArchived ? '' : 'archive-text'}`}>
              {isArchived ? 'Unarchive' : 'Archive'}
            </span>
          </button>
        </div>
      )}
    </>
  );
};

export default CardMenu;

