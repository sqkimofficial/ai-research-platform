import React, { useState, useEffect } from 'react';
import { documentAPI } from '../../services/api';
import { getSessionId } from '../../utils/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import SectionSelector from './SectionSelector';
import './DocumentPanel.css';

const DocumentPanel = ({ refreshTrigger, onAttachSections }) => {
  const [content, setContent] = useState('');
  const [structure, setStructure] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSectionSelector, setShowSectionSelector] = useState(false);
  const [selectedSections, setSelectedSections] = useState([]);

  const fetchDocument = async () => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setError('No active session');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await documentAPI.getDocument(sessionId);
      const markdownContent = response.data.content || '';
      const documentStructure = response.data.structure || [];
      setContent(markdownContent);
      setStructure(documentStructure);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load document');
      console.error('Failed to fetch document:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocument();
  }, []);

  // Auto-refresh when refreshTrigger changes (new AI message)
  useEffect(() => {
    if (refreshTrigger > 0) {
      // Small delay to ensure backend has written the file
      setTimeout(() => {
        fetchDocument();
      }, 500);
    }
  }, [refreshTrigger]);

  const handleRefresh = () => {
    fetchDocument();
  };

  const handleSelectionChange = (selectedIds) => {
    setSelectedSections(selectedIds);
  };

  const handleAttachSections = () => {
    if (selectedSections.length === 0) {
      setError('Please select at least one section to attach');
      return;
    }
    
    // Get selected structure elements
    const selectedElements = structure.filter(elem => 
      selectedSections.includes(elem.id)
    );
    
    if (onAttachSections) {
      onAttachSections(selectedElements);
      setShowSectionSelector(false);
      setSelectedSections([]);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setError('No active session');
      return;
    }

    // Content is already in state from textarea onChange
    setLoading(true);
    setError('');
    try {
      await documentAPI.saveDocument(sessionId, content, 'replace');
      setIsEditing(false);
      await fetchDocument();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save document');
      console.error('Failed to save document:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reload original content
    fetchDocument();
  };

  const handleDownloadPDF = async () => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setError('No active session');
      return;
    }

    try {
      const response = await documentAPI.downloadPDF(sessionId);
      // Create blob and download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `research-document-${sessionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download PDF');
      console.error('Failed to download PDF:', err);
    }
  };

  return (
    <div className="document-panel">
      <div className="document-panel-header">
        <h2>Research Output</h2>
        <div className="document-actions">
          {!isEditing ? (
            <>
              {structure.length > 0 && (
                <button 
                  onClick={() => setShowSectionSelector(!showSectionSelector)} 
                  className="attach-button"
                  disabled={loading}
                  title="Select sections to attach to chat"
                >
                  {showSectionSelector ? 'Hide' : 'Attach Sections'}
                </button>
              )}
              <button 
                onClick={handleEdit} 
                className="edit-button"
                disabled={loading}
              >
                Edit
              </button>
              <button 
                onClick={handleDownloadPDF} 
                className="download-button"
                disabled={loading || !content}
              >
                Download PDF
              </button>
              <button 
                onClick={handleRefresh} 
                className="refresh-button"
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={handleSave} 
                className="save-button"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button 
                onClick={handleCancel} 
                className="cancel-button"
                disabled={loading}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      <div className="document-content">
        {error && <div className="error-message">{error}</div>}
        {loading && !content && (
          <div className="loading-message">Loading document...</div>
        )}
        {!loading && !error && (
          <>
            {showSectionSelector && structure.length > 0 && (
              <div className="section-selector-container">
                <SectionSelector
                  structure={structure}
                  onSelectionChange={handleSelectionChange}
                />
                <div className="attach-actions">
                  <button
                    onClick={handleAttachSections}
                    className="attach-confirm-button"
                    disabled={selectedSections.length === 0}
                  >
                    Attach Selected ({selectedSections.length})
                  </button>
                  <button
                    onClick={() => {
                      setShowSectionSelector(false);
                      setSelectedSections([]);
                    }}
                    className="attach-cancel-button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {isEditing ? (
              <textarea
                className="document-editor"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  minHeight: '400px',
                  width: '100%',
                  padding: '20px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  outline: 'none',
                  fontFamily: 'Monaco, "Courier New", monospace',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  backgroundColor: '#f8f9fa',
                  resize: 'vertical'
                }}
              />
            ) : (
              <div className="document-preview markdown-body">
                {content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                  >
                    {content}
                  </ReactMarkdown>
                ) : (
                  <p>No content yet. Start a conversation to build your research document.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentPanel;

