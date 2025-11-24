import React from 'react';
import './ChatWindow.css';

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  const sources = message.sources || [];
  const attachedSections = message.attachedSections || [];
  
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


