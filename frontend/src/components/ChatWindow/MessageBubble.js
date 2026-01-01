import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './ChatWindow.css';
import dropdownIcon from '../../assets/dropdown-icon.svg';
import webIcon from '../../assets/web-icon.svg';
import { ReactComponent as CopyIconSvg } from '../../assets/copy-icon.svg';
import { ReactComponent as CheckIconSvg } from '../../assets/check-icon.svg';
import { ReactComponent as CancelIconSvg } from '../../assets/cancel-icon.svg';

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

const MessageBubble = ({ message, onApprove, onInsertWithAI, onReject, onEdit, editedContent }) => {
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
    // Direct insertion at cursor or end of document (no AI placement)
    const contentToApprove = isEditing ? localEditedContent : documentContent;
    if (onApprove && pendingContentId) {
      onApprove(pendingContentId, contentToApprove);
    }
  };

  const handleInsertWithAI = () => {
    // Use AI (Stage 2) to intelligently place content in document
    const contentToApprove = isEditing ? localEditedContent : documentContent;
    if (onInsertWithAI && pendingContentId) {
      onInsertWithAI(pendingContentId, contentToApprove);
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
                      <img src={webIcon} alt="" className="source-icon-img" />
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
            {copied ? <CheckIconSvg className="action-icon" /> : <CopyIconSvg className="action-icon" />}
          </button>
          </div>
          {isPendingApproval && !isEditing && (
            <div className="action-right">
              <button className="edit-content-btn" onClick={handleEdit}>Edit</button>
              <button className="approve-btn" onClick={handleApprove} title="Insert at cursor position (or end of document)">
                <CheckIconSvg className="action-icon" />
                <span>Approve</span>
              </button>
              <button className="insert-with-ai-btn" onClick={handleInsertWithAI} title="Let AI decide where to place content">
                <span>Insert with AI</span>
              </button>
              <button className="reject-btn" onClick={handleReject}>
                <CancelIconSvg className="action-icon" />
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
