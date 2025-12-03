import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './ChatWindow.css';

const MessageBubble = ({ message, onApprove, onReject, onEdit, editedContent }) => {
  const isUser = message.role === 'user';
  const sources = message.sources || [];
  const attachedSections = message.attachedSections || [];
  const attachedHighlights = message.attachedHighlights || [];
  const status = message.status;
  const documentContent = message.document_content || '';
  const pendingContentId = message.pending_content_id;
  const isPendingApproval = status === 'pending_approval';
  const [isEditing, setIsEditing] = useState(false);
  const [localEditedContent, setLocalEditedContent] = useState(documentContent);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentWrapperRef = useRef(null);
  const contentRef = useRef(null);

  // Check if content overflows 3 lines
  const checkOverflow = useCallback(() => {
    if (isUser && contentRef.current && contentWrapperRef.current) {
      const lineHeight = 13 * 1.25; // font-size * line-height
      const threeLineHeight = lineHeight * 3;
      const actualHeight = contentRef.current.scrollHeight;
      setIsOverflowing(actualHeight > threeLineHeight + 2); // +2 for small tolerance
    }
  }, [isUser]);

  // Check overflow on mount and resize
  useEffect(() => {
    checkOverflow();
    
    // Window resize listener
    const handleResize = () => {
      checkOverflow();
    };
    window.addEventListener('resize', handleResize);
    
    // ResizeObserver for container resize (when panel is resized)
    let resizeObserver;
    if (contentWrapperRef.current) {
      resizeObserver = new ResizeObserver(() => {
        checkOverflow();
      });
      resizeObserver.observe(contentWrapperRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [checkOverflow, message.content]);
  
  const handleEdit = () => {
    setIsEditing(true);
    setLocalEditedContent(documentContent);
  };
  
  const handleSaveEdit = () => {
    setIsEditing(false);
    if (onEdit) {
      onEdit(localEditedContent);
    }
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setLocalEditedContent(documentContent);
  };
  
  const handleApprove = () => {
    const contentToApprove = isEditing ? localEditedContent : documentContent;
    if (onApprove && pendingContentId) {
      onApprove(pendingContentId, contentToApprove);
    }
  };
  
  const handleReject = () => {
    if (onReject && pendingContentId) {
      onReject(pendingContentId);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <div className={`message-bubble ${isUser ? 'user-message' : 'assistant-message'} ${isUser && isExpanded ? 'expanded' : ''}`}>
      {isUser ? (
        <>
          <div 
            ref={contentWrapperRef}
            className={`user-message-content-wrapper ${isExpanded ? 'expanded' : 'collapsed'} ${!isExpanded && isOverflowing ? 'has-overflow' : ''}`}
          >
            <div ref={contentRef}>
              {attachedSections.length > 0 && (
                <div className="attached-sections-preview">
                  <div className="attached-label">Attached sections ({attachedSections.length}):</div>
                  <pre className="attached-markdown">{attachedSections.map(s => s.content).join('\n\n')}</pre>
                </div>
              )}
              {attachedHighlights.length > 0 && (
                <div className="attached-highlights-preview">
                  <div className="attached-label">Attached highlights ({attachedHighlights.length}):</div>
                  <div className="attached-highlights-content">
                    {attachedHighlights.map((h, idx) => (
                      <div key={h.id || idx} className="attached-highlight-preview-item">
                        <span className="highlight-quote">"{h.text}"</span>
                        {h.note && <span className="highlight-note-preview">Note: {h.note}</span>}
                        {h.source && <span className="highlight-source-preview">From: {h.sourceTitle || h.source}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="message-content">
                {message.content}
              </div>
            </div>
          </div>
          {isOverflowing && (
            <button 
              className="expand-collapse-btn"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              )}
            </button>
          )}
        </>
      ) : (
        <div className="message-content">
          {message.content}
        </div>
      )}
      
      {/* Pending Content Preview */}
      {!isUser && isPendingApproval && documentContent && (
        <div className="pending-content-preview">
          <div className="pending-content-label">Generated Content (Pending Approval)</div>
          {isEditing ? (
            <div className="pending-content-editor">
              <textarea
                className="content-editor-textarea"
                value={localEditedContent}
                onChange={(e) => setLocalEditedContent(e.target.value)}
                rows={10}
              />
              <div className="content-editor-actions">
                <button className="cancel-edit-btn" onClick={handleCancelEdit}>Cancel</button>
                <button className="save-edit-btn" onClick={handleSaveEdit}>Save</button>
              </div>
            </div>
          ) : (
            <div className="pending-content-preview-markdown markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {editedContent || documentContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
      
      {/* Status indicators */}
      {!isUser && status === 'approved' && (
        <div className="content-status approved-status">✓ Content approved and placed</div>
      )}
      {!isUser && status === 'rejected' && (
        <div className="content-status rejected-status">✗ Content rejected</div>
      )}
      
      {/* Sources Section - New Design */}
      {!isUser && sources.length > 0 && (
        <div className="message-sources">
          <div className="sources-label">Sources</div>
          <ul className="sources-list">
            {sources.map((source, index) => {
              const normalizedSource = typeof source === 'string' ? source.trim() : String(source);
              const isUrl = normalizedSource.startsWith('http://') || 
                           normalizedSource.startsWith('https://') ||
                           normalizedSource.startsWith('www.');
              const url = isUrl && !normalizedSource.startsWith('http') 
                         ? `https://${normalizedSource}` 
                         : normalizedSource;
              
              return (
                <li key={index}>
                  <div className="source-item">
                    <span className="source-icon">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                      </svg>
                    </span>
                    {isUrl || normalizedSource.includes('.') ? (
                      <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="source-link"
                      >
                        {normalizedSource}
                      </a>
                    ) : (
                      <span className="source-text">{normalizedSource}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Action Buttons Row - New Design */}
      {!isUser && (isPendingApproval || sources.length > 0) && (
        <div className="message-actions">
          <div className="action-left">
            <button className="copy-btn" onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>
              {copied ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
          </div>
          {isPendingApproval && !isEditing && (
            <div className="action-right">
              <button className="edit-content-btn" onClick={handleEdit}>Edit</button>
              <button className="approve-btn" onClick={handleApprove}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Approve</span>
              </button>
              <button className="reject-btn" onClick={handleReject}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>Reject</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
