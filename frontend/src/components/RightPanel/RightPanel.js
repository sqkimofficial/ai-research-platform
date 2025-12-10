import React from 'react';
import './RightPanel.css';
import { ReactComponent as WebIcon } from '../../assets/web-icon.svg';
import { ReactComponent as PdfIcon } from '../../assets/pdf-icon.svg';
import { ReactComponent as DocumentIcon } from '../../assets/document-icon.svg';

const RightPanel = ({ onHighlightsClick, onPDFsClick, onResearchDocsClick }) => {
  return (
    <div className="right-panel">
      <div className="right-panel-icons">
        <button 
          className="right-panel-icon-button"
          onClick={onHighlightsClick}
          title="Web Highlights"
        >
          <WebIcon className="right-panel-icon" />
        </button>
        <button 
          className="right-panel-icon-button"
          onClick={onPDFsClick}
          title="Document Highlights (PDF, JPG, PNG)"
        >
          <PdfIcon className="right-panel-icon" />
        </button>
        <button 
          className="right-panel-icon-button"
          onClick={onResearchDocsClick}
          title="Research Output Documents"
        >
          <DocumentIcon className="right-panel-icon" />
        </button>
      </div>
    </div>
  );
};

export default RightPanel;
