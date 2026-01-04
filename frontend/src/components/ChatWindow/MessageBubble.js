import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './ChatWindow.css';
import dropdownIcon from '../../assets/dropdown-icon.svg';
import webIcon from '../../assets/web-icon.svg';
import { ReactComponent as CopyIconSvg } from '../../assets/copy-icon.svg';
import { ReactComponent as CheckIconSvg } from '../../assets/check-icon.svg';
import { ReactComponent as EditSimpleIcon } from '../../assets/edit-simple.svg';
import { ReactComponent as InsertIcon } from '../../assets/insert-icon.svg.svg';
import expandIcon from '../../assets/expand-icon.svg';

// Helper function to format message content with bold subheadings
const formatMessageContent = (content) => {
  if (!content) return content;
  
  // Split by <strong> tags and render appropriately
  const parts = content.split(/(<strong>.*?<\/strong>)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('<strong>') && part.endsWith('</strong>')) {
      // Extract text from <strong> tags and render as bold
      const text = part.replace(/<\/?strong>/g, '');
      return <strong key={index}>{text}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
};

const MessageBubble = ({ message, onApprove, onEdit, editedContent, mode = 'write' }) => {
  const isUser = message.role === 'user';
  const sources = message.sources || [];
  const attachedSections = message.attachedSections || [];
  const attachedHighlights = message.attachedHighlights || [];
  const documentContent = message.document_content || '';
  const pendingContentId = message.pending_content_id;
  const messageStatus = message.status || '';
  const [isEditing, setIsEditing] = useState(false);
  const [localEditedContent, setLocalEditedContent] = useState(documentContent);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [isInserted, setIsInserted] = useState(messageStatus === 'approved');
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const contentWrapperRef = useRef(null);
  const contentRef = useRef(null);
  const sourcesDropdownRef = useRef(null);

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

  // Initialize isInserted from message status
  useEffect(() => {
    setIsInserted(messageStatus === 'approved');
  }, [messageStatus]);

  // Close sources dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sourcesDropdownRef.current && !sourcesDropdownRef.current.contains(event.target)) {
        setIsSourcesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
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
    // Direct insertion at cursor or end of document (no AI placement)
    const contentToApprove = isEditing ? localEditedContent : documentContent;
    if (onApprove && pendingContentId) {
      onApprove(pendingContentId, contentToApprove);
      setIsInserted(true);
      setIsContentExpanded(false);
    }
  };

  const handleCopy = async () => {
    try {
      // Copy document content if available, otherwise copy message content
      const contentToCopy = documentContent || message.content;
      await navigator.clipboard.writeText(contentToCopy);
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
              <img
                src={dropdownIcon}
                alt=""
                className="dropdown-caret-icon"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>
          )}
        </>
      ) : (
        <div className="message-content">
          {formatMessageContent(message.content)}
        </div>
      )}
      
      {/* Generated Content Preview */}
      {!isUser && documentContent && (
        <div className="pending-content-preview">
          {isInserted && !isContentExpanded ? (
            <div className="inserted-content-collapsed">
              <p className="inserted-content-label">Content inserted in document</p>
              <button 
                className="expand-content-btn"
                onClick={() => setIsContentExpanded(true)}
                title="Expand content"
              >
                <img
                  src={expandIcon}
                  alt=""
                  className="expand-content-icon"
                />
              </button>
            </div>
          ) : isEditing ? (
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
            <div className="pending-content-preview-wrapper">
              <div className="pending-content-preview-box">
                <div className="pending-content-preview-markdown markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                  >
                    {editedContent || documentContent}
                  </ReactMarkdown>
                </div>
              </div>
              {mode === 'write' && !isInserted && (
                <button className="inline-edit-btn" onClick={handleEdit} title="Edit">
                  <EditSimpleIcon className="inline-edit-icon" />
                </button>
              )}
              {isInserted && isContentExpanded && (
                <button 
                  className="collapse-content-btn"
                  onClick={() => setIsContentExpanded(false)}
                  title="Collapse content"
                >
                  <img
                    src={expandIcon}
                    alt=""
                    className="expand-content-icon"
                    style={{ transform: 'rotate(180deg)' }}
                  />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sources and Action Buttons Row */}
      {!isUser && (documentContent || sources.length > 0) && (
        <div className="message-actions-row">
          {/* Sources Dropdown */}
          {sources.length > 0 && (
            <div className="sources-dropdown-wrapper" ref={sourcesDropdownRef}>
              <button 
                className="sources-dropdown-button"
                onClick={() => setIsSourcesOpen(!isSourcesOpen)}
                aria-expanded={isSourcesOpen}
              >
                <img 
                  src={dropdownIcon} 
                  alt="" 
                  className="sources-dropdown-icon"
                  style={{ transform: isSourcesOpen ? 'rotate(90deg)' : 'rotate(270deg)' }}
                />
                <span className="sources-dropdown-text">Sources</span>
              </button>
              {isSourcesOpen && (
                <div className="sources-dropdown-list">
                  {sources.map((source, index) => {
                    const normalizedSource = typeof source === 'string' ? source.trim() : String(source);
                    const isUrl = normalizedSource.startsWith('http://') || 
                                 normalizedSource.startsWith('https://') ||
                                 normalizedSource.startsWith('www.');
                    const url = isUrl && !normalizedSource.startsWith('http') 
                               ? `https://${normalizedSource}` 
                               : normalizedSource;
                    
                    return (
                      <div key={index} className="source-dropdown-item">
                        <span className="source-icon">
                          <img src={webIcon} alt="" className="source-icon-img" />
                        </span>
                        {isUrl || normalizedSource.includes('.') ? (
                          <a 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="source-dropdown-link"
                          >
                            {normalizedSource}
                          </a>
                        ) : (
                          <span className="source-dropdown-text">{normalizedSource}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
          {/* Action Buttons */}
          {mode === 'write' && documentContent && !isEditing && (
            <div className="action-buttons-group">
              <button 
                className="action-button copy-action-btn" 
                onClick={handleCopy} 
                title={copied ? "Copied!" : "Copy"}
              >
                {copied ? (
                  <CheckIconSvg className="action-button-icon" />
                ) : (
                  <CopyIconSvg className="action-button-icon" />
                )}
                <span className="action-button-text">Copy</span>
              </button>
              <button 
                className="action-button insert-action-btn" 
                onClick={handleApprove} 
                title="Insert at cursor position (or end of document)"
              >
                <InsertIcon className="action-button-icon" />
                <span className="action-button-text">Insert</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
