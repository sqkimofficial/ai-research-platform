import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './ChatWindow.css';

const MessageBubble = ({ message, onApprove, onReject, onEdit, editedContent }) => {
  const isUser = message.role === 'user';
  const sources = message.sources || [];
  const attachedSections = message.attachedSections || [];
  const status = message.status;
  const documentContent = message.document_content || '';
  const pendingContentId = message.pending_content_id;
  const isPendingApproval = status === 'pending_approval';
  const [isEditing, setIsEditing] = useState(false);
  const [localEditedContent, setLocalEditedContent] = useState(documentContent);
  
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
  
  return (
    <div className={`message-bubble ${isUser ? 'user-message' : 'assistant-message'}`}>
      {isUser && attachedSections.length > 0 && (
        <div className="attached-sections-preview">
          <div className="attached-label">Attached sections ({attachedSections.length}):</div>
          <pre className="attached-markdown">{attachedSections.map(s => s.content).join('\n\n')}</pre>
        </div>
      )}
      <div className="message-content">
        {message.content}
      </div>
      
      {/* Pending Content Preview */}
      {!isUser && isPendingApproval && documentContent && (
        <div className="pending-content-preview">
          <div className="pending-content-label">Generated Content (Pending Approval):</div>
          {isEditing ? (
            <div className="pending-content-editor">
              <textarea
                className="content-editor-textarea"
                value={localEditedContent}
                onChange={(e) => setLocalEditedContent(e.target.value)}
                rows={10}
              />
              <div className="content-editor-actions">
                <button className="save-edit-btn" onClick={handleSaveEdit}>Save</button>
                <button className="cancel-edit-btn" onClick={handleCancelEdit}>Cancel</button>
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
          {!isEditing && (
            <div className="pending-content-actions">
              <button className="edit-content-btn" onClick={handleEdit}>Edit</button>
              <button className="approve-btn" onClick={handleApprove}>Approve</button>
              <button className="reject-btn" onClick={handleReject}>Reject</button>
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
      
      {!isUser && sources.length > 0 && (
        <div className="message-sources">
          <div className="sources-label">Sources:</div>
          <ul className="sources-list">
            {sources.map((source, index) => {
              // Normalize source - handle URLs with or without http/https
              const normalizedSource = typeof source === 'string' ? source.trim() : String(source);
              const isUrl = normalizedSource.startsWith('http://') || 
                           normalizedSource.startsWith('https://') ||
                           normalizedSource.startsWith('www.');
              const url = isUrl && !normalizedSource.startsWith('http') 
                         ? `https://${normalizedSource}` 
                         : normalizedSource;
              
              return (
                <li key={index}>
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
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="message-timestamp">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default MessageBubble;


