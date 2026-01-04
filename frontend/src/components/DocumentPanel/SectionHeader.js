import React from 'react';
import { ReactComponent as SearchIconSvg } from '../../assets/search.svg';
import { ReactComponent as PlusIconSvg } from '../../assets/plus-icon.svg';

// Share/Upload icon from Figma (Communication / Share_iOS_Export)
const ShareUploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M5.33337 6.66667H4.00004C3.64642 6.66667 3.30728 6.80714 3.05723 7.05719C2.80718 7.30724 2.66671 7.64638 2.66671 8V13.3333C2.66671 13.687 2.80718 14.0261 3.05723 14.2761C3.30728 14.5262 3.64642 14.6667 4.00004 14.6667H12C12.3537 14.6667 12.6928 14.5262 12.9428 14.2761C13.1929 14.0261 13.3334 13.687 13.3334 13.3333V8C13.3334 7.64638 13.1929 7.30724 12.9428 7.05719C12.6928 6.80714 12.3537 6.66667 12 6.66667H10.6667M8.00004 10.6667V1.33334M8.00004 1.33334L5.33337 4.00001M8.00004 1.33334L10.6667 4.00001" 
      stroke="white" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

const SectionHeader = ({
  title,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search...",
  ctaType = 'create', // 'create' | 'upload' | 'disabled'
  ctaOnClick,
  ctaDisabled = false,
  ctaText,
  className = ''
}) => {
  const renderCTA = () => {
    if (ctaType === 'disabled') {
      return (
        <button
          className="create-new-button url-create-new-button-disabled"
          disabled={true}
          title="Create new highlight (disabled)"
        >
          <PlusIconSvg className="create-new-icon" />
          <span className="create-new-text">{ctaText || 'Create New'}</span>
        </button>
      );
    }
    
    if (ctaType === 'upload') {
      return (
        <button
          className="upload-new-button"
          onClick={ctaOnClick}
          disabled={ctaDisabled}
          title="Upload PDF, JPG, or PNG"
        >
          <ShareUploadIcon />
          <span>{ctaDisabled ? 'Uploading...' : (ctaText || 'Upload New')}</span>
        </button>
      );
    }
    
    // Default: create button
    return (
      <button
        className="create-new-button"
        onClick={ctaOnClick}
        disabled={ctaDisabled}
        title="Create new research document"
      >
        <PlusIconSvg className="create-new-icon" />
        <span className="create-new-text">{ctaText || 'Create New'}</span>
      </button>
    );
  };

  return (
    <div className={`section-header ${className}`}>
      <h2 className="section-header-title">{title}</h2>
      <div className="section-header-actions">
        <div className="section-header-search-bar">
          <SearchIconSvg className="section-header-search-icon" />
          <input
            type="text"
            className="section-header-search-input"
            placeholder={searchPlaceholder}
            value={searchQuery || ''}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {renderCTA()}
      </div>
    </div>
  );
};

export default SectionHeader;

