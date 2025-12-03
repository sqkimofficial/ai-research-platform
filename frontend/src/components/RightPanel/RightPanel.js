import React from 'react';
import './RightPanel.css';

// Globe icon SVG from Figma
const GlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M10 18.333C14.6024 18.333 18.333 14.6024 18.333 10C18.333 5.39763 14.6024 1.66699 10 1.66699C5.39763 1.66699 1.66699 5.39763 1.66699 10C1.66699 14.6024 5.39763 18.333 10 18.333Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M1.66699 10H18.333" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M10 1.66699C12.0844 3.94863 13.269 6.91003 13.333 10C13.269 13.09 12.0844 16.0514 10 18.333C7.91562 16.0514 6.73106 13.09 6.66699 10C6.73106 6.91003 7.91562 3.94863 10 1.66699Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Book Open icon SVG from Figma
const BookOpenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M10 5.41667C10 4.5272 10 4.08246 9.87639 3.72236C9.67279 3.12709 9.2062 2.66051 8.61094 2.4569C8.25083 2.33333 7.8061 2.33333 6.91663 2.33333C5.58318 2.33333 4.91645 2.33333 4.39476 2.57832C3.93316 2.79598 3.54596 3.18318 3.3283 3.64478C3.08331 4.16647 3.08331 4.8332 3.08331 6.16667V15.4167C3.08331 14.5272 3.08331 14.0825 3.20693 13.7224C3.41054 13.1271 3.87712 12.6605 4.47238 12.4569C4.83248 12.3333 5.27722 12.3333 6.16669 12.3333H8.33331C8.80002 12.3333 9.03338 12.3333 9.21163 12.4242C9.36844 12.5047 9.49527 12.6316 9.57582 12.7884C9.66665 12.9666 9.66665 13.2 9.66665 13.6667V5.41667Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M10 5.41667C10 4.5272 10 4.08246 10.1236 3.72236C10.3272 3.12709 10.7938 2.66051 11.3891 2.4569C11.7492 2.33333 12.1939 2.33333 13.0834 2.33333C14.4168 2.33333 15.0836 2.33333 15.6052 2.57832C16.0668 2.79598 16.454 3.18318 16.6717 3.64478C16.9167 4.16647 16.9167 4.8332 16.9167 6.16667V15.4167C16.9167 14.5272 16.9167 14.0825 16.7931 13.7224C16.5895 13.1271 16.1229 12.6605 15.5276 12.4569C15.1675 12.3333 14.7228 12.3333 13.8333 12.3333H11.6667C11.2 12.3333 10.9666 12.3333 10.7884 12.4242C10.6316 12.5047 10.5047 12.6316 10.4242 12.7884C10.3333 12.9666 10.3333 13.2 10.3333 13.6667V5.41667Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

const RightPanel = ({ onHighlightsClick, onPDFsClick }) => {
  return (
    <div className="right-panel">
      <div className="right-panel-icons">
        <button 
          className="right-panel-icon-button"
          onClick={onHighlightsClick}
          title="Web Highlights"
        >
          <GlobeIcon />
        </button>
        <button 
          className="right-panel-icon-button"
          onClick={onPDFsClick}
          title="Document Highlights (PDF, JPG, PNG)"
        >
          <BookOpenIcon />
        </button>
      </div>
    </div>
  );
};

export default RightPanel;
