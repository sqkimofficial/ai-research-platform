import React from 'react';
import './RightPanel.css';

const RightPanel = ({ onHighlightsClick, onPDFsClick }) => {
  return (
    <div className="right-panel">
      <div className="right-panel-content">
        <button 
          className="highlights-icon-button"
          onClick={onHighlightsClick}
          title="View Highlights"
        >
          <span className="highlights-icon">✨</span>
        </button>
        <button 
          className="pdfs-icon-button"
          onClick={onPDFsClick}
          title="Highlight Docs (PDF, JPG, PNG)"
        >
          <span className="pdfs-icon">🖼️</span>
        </button>
      </div>
    </div>
  );
};

export default RightPanel;

