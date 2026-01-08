import React, { useState, useMemo, useCallback } from 'react';
import researchIcon from '../../assets/research-icon.svg';
import { ReactComponent as DocumentIconSvg } from '../../assets/document-icon.svg';
import { ReactComponent as WebIconSvg } from '../../assets/web-icon.svg';
import { ReactComponent as PdfIconSvg } from '../../assets/pdf-icon.svg';
import dropdownIcon from '../../assets/dropdown-icon.svg';
import plusIcon from '../../assets/plus-icon.svg';
import { ReactComponent as PlusIconSvg } from '../../assets/plus-icon.svg';
import DocumentCardMenu from './DocumentCardMenu';
import { documentAPI } from '../../services/api';

// Search icon for search bar
const SearchIcon = () => <img src={researchIcon} alt="" className="add-tab-search-img" />;

// File/Document icon for Document Entries button
const FileDocumentIcon = () => <DocumentIconSvg className="add-tab-action-img outline-icon" />;

// Globe icon for Web Sources button
const GlobeIcon = () => <WebIconSvg className="add-tab-action-img globe-icon outline-icon" />;

// Book/Physical PDF icon for Physical Sources button
const BookOpenIcon = () => <PdfIconSvg className="add-tab-action-img outline-icon" />;

// File/Document icon (20px) for card icons
const FileDocumentIconCard = () => <DocumentIconSvg className="add-tab-card-img" />;

// Globe icon (20px) for URL cards
const GlobeIconCard = () => <WebIconSvg className="add-tab-card-img globe-icon" />;

// PDF icon for document cards
const BookOpenIconCard = () => <PdfIconSvg className="add-tab-card-img" />;

// Caret Down icon (12px)
const CaretDownIcon = () => <img src={dropdownIcon} alt="" className="add-tab-caret-img" />;

// Simple fuzzy search implementation
const fuzzySearch = (query, text) => {
  if (!query) return true;
  const queryLower = query.toLowerCase();
  const textLower = (text || '').toLowerCase();
  
  // Simple contains match
  if (textLower.includes(queryLower)) return true;
  
  // Fuzzy character sequence match
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
};

const AddNewTabView = ({
  researchDocuments = [],
  urlHighlights = [],
  pdfDocuments = [],
  onCreateNewDocument,
  onOpenDocument,
  onOpenUrlHighlight,
  onOpenPdfDocument,
  onUploadPdf,
  onRefreshDocuments
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedTimeSections, setExpandedTimeSections] = useState({
    nonArchived: true,
    archive: true
  });
  const [failedFavicons, setFailedFavicons] = useState(new Set());
  
  // Helper to parse UTC date string - browser automatically converts to local timezone
  // Returns null if dateString is invalid or missing (never returns current time)
  const parseUTCDate = (dateString) => {
    if (!dateString) return null;
    let dateStr = String(dateString).trim();
    if (!dateStr || dateStr === 'undefined' || dateStr === 'null') return null;
    
    // If date string doesn't have timezone info and is ISO format, treat as UTC
    if (dateStr.includes('T') && !dateStr.endsWith('Z') && 
        !/[+-]\d{2}:\d{2}$/.test(dateStr) && !/[+-]\d{4}$/.test(dateStr)) {
      dateStr = dateStr + 'Z';
    }
    
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };

  // Format time for cards using browser's native date formatting
  const formatLastUpdatedTime = (dateString) => {
    const date = parseUTCDate(dateString);
    if (!date) return '—'; // Return placeholder if no valid date
    
    const now = new Date();
    
    // Get today's date in local timezone (browser handles this automatically)
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    
    // Get item's date in local timezone (browser handles this automatically)
    const itemYear = date.getFullYear();
    const itemMonth = date.getMonth();
    const itemDay = date.getDate();
    
    // If it's not today, show date in format "7 Jan, 2026"
    if (itemYear !== todayYear || itemMonth !== todayMonth || itemDay !== todayDay) {
      // Format as "7 Jan, 2026" using browser's local timezone values
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = date.getDate(); // Browser automatically converts to local timezone
      const month = months[date.getMonth()]; // Browser automatically converts to local timezone
      const year = date.getFullYear(); // Browser automatically converts to local timezone
      return `${day} ${month}, ${year}`;
    }
    
    // Otherwise show time using browser's native time formatting
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    const timeStr = date.toLocaleTimeString('en-US', options);
    return `Last Updated ${timeStr}`;
  };

  // Extract domain name from URL
  const extractDomain = (url) => {
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname;
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch {
      return 'Website';
    }
  };

  // Get favicon URL for a given URL (same as URL highlights page)
  const getFaviconUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=128`;
    } catch {
      return null;
    }
  };

  // Normalize all items into a unified format for rendering
  const getAllItems = useMemo(() => {
    const items = [];
    
    // Add research documents
    researchDocuments.forEach(doc => {
      items.push({
        type: 'entry',
        id: doc.document_id,
        title: doc.title || 'Untitled Document',
        date: doc.updated_at || doc.created_at,
        snapshot: doc.snapshot || null,
        archived: doc.archived || false,
        data: doc
      });
    });
    
    // Add URL highlights
    urlHighlights.forEach(url => {
      items.push({
        type: 'url',
        id: url.source_url,
        title: url.page_title || extractDomain(url.source_url),
        subtitle: `${url.highlights?.length || 0} highlight${(url.highlights?.length || 0) !== 1 ? 's' : ''}`,
        domain: extractDomain(url.source_url),
        date: url.updated_at || url.created_at,
        sourceUrl: url.source_url, // Store source_url for favicon generation
        data: url
      });
    });
    
    // Add PDF documents
    pdfDocuments.forEach(pdf => {
      items.push({
        type: 'pdf',
        id: pdf.pdf_id,
        title: pdf.filename,
        subtitle: `${pdf.highlights?.length || 0} highlight${(pdf.highlights?.length || 0) !== 1 ? 's' : ''}`,
        date: pdf.updated_at || pdf.created_at,
        thumbnail: pdf.thumbnail_url,
        data: pdf
      });
    });
    
    return items;
  }, [researchDocuments, urlHighlights, pdfDocuments]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery) return getAllItems;
    return getAllItems.filter(item => 
      fuzzySearch(searchQuery, item.title) || 
      fuzzySearch(searchQuery, item.subtitle) ||
      (item.domain && fuzzySearch(searchQuery, item.domain))
    );
  }, [getAllItems, searchQuery]);

  // Group items: sort by date descending (newest first)
  const groupedItems = useMemo(() => {
    const sorted = [...filteredItems];
    
    // Sort by date descending (newest first)
    sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return {
      nonArchived: sorted,
      archived: []
    };
  }, [filteredItems]);

  // Toggle group expansion
  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  // Check if group is expanded (default to expanded)
  const isGroupExpanded = (groupKey) => {
    return expandedGroups[groupKey] !== false;
  };

  // Toggle time section expansion
  const toggleTimeSection = (sectionKey) => {
    setExpandedTimeSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Check if time section is expanded (default to expanded)
  const isTimeSectionExpanded = (sectionKey) => {
    return expandedTimeSections[sectionKey] !== false;
  };

  // Handle item click based on type
  const handleItemClick = (item) => {
    switch (item.type) {
      case 'entry':
        onOpenDocument?.(item.data);
        break;
      case 'url':
        onOpenUrlHighlight?.(item.data);
        break;
      case 'pdf':
        onOpenPdfDocument?.(item.data);
        break;
      default:
        break;
    }
  };

  // Handle favicon image error
  const handleFaviconError = useCallback((itemId) => {
    setFailedFavicons(prev => new Set([...prev, itemId]));
  }, []);

  // Render card based on item type
  const renderCard = (item) => {
    if (item.type === 'entry') {
      // Written document card
      return (
        <div 
          key={`entry-${item.id}`}
          className="written-doc-card"
          onClick={() => handleItemClick(item)}
        >
          <div className="written-card-thumbnail">
            {item.snapshot ? (
              <img src={item.snapshot} alt={item.title} className="written-card-snapshot" />
            ) : (
              <div className="written-card-thumbnail-placeholder">
                <span className="txt-placeholder">TXT</span>
              </div>
            )}
          </div>
          <div className="written-card-content">
            <div className="written-card-title-section">
              <p className="written-card-title">{item.title}</p>
            </div>
            <div className="written-card-date">
              <span>{formatLastUpdatedTime(item.date)}</span>
            </div>
          </div>
          <DocumentCardMenu
            documentId={item.id}
            isArchived={item.archived}
            onRename={async () => {
              const newTitle = prompt('Enter new title:', item.title);
              if (newTitle && newTitle.trim() && newTitle !== item.title) {
                try {
                  await documentAPI.renameDocument(item.id, newTitle);
                  onRefreshDocuments?.();
                } catch (error) {
                  console.error('Failed to rename document:', error);
                  alert('Failed to rename document. Please try again.');
                }
              }
            }}
            onArchive={async () => {
              try {
                await documentAPI.archiveDocument(item.id);
                // Invalidate documents cache
                try {
                  console.log('[CACHE] Invalidating cache for project (from AddNewTabView)');
                  // projectId is not directly available here; rely on parent refresh to reload cache
                  // If parent passes a refresh callback, it will refetch and recache
                } catch (e) {
                  console.warn('Cache invalidation warning:', e);
                }
                onRefreshDocuments?.();
              } catch (error) {
                console.error('Failed to archive document:', error);
                alert('Failed to archive document. Please try again.');
              }
            }}
            onUnarchive={async () => {
              try {
                await documentAPI.unarchiveDocument(item.id);
                // Invalidate documents cache
                try {
                  console.log('[CACHE] Invalidating cache for project (from AddNewTabView)');
                } catch (e) {
                  console.warn('Cache invalidation warning:', e);
                }
                onRefreshDocuments?.();
              } catch (error) {
                console.error('Failed to unarchive document:', error);
                alert('Failed to unarchive document. Please try again.');
              }
            }}
          />
        </div>
      );
    }
    
    if (item.type === 'url') {
      // URL highlight card - use same favicon logic as URL highlights page
      const faviconUrl = getFaviconUrl(item.sourceUrl);
      const showPlaceholder = !faviconUrl || failedFavicons.has(item.id);
      return (
        <div 
          key={`url-${item.id}`}
          className="url-highlight-card"
          onClick={() => handleItemClick(item)}
        >
          <div className="url-card-thumbnail">
            <div className="url-card-favicon">
              {faviconUrl && !failedFavicons.has(item.id) ? (
                <img 
                  src={faviconUrl} 
                  alt={item.domain}
                  onError={() => handleFaviconError(item.id)}
                />
              ) : null}
              {showPlaceholder && (
                <div className="url-card-favicon-placeholder">
                  <GlobeIconCard />
                </div>
              )}
            </div>
            <div className="url-card-site-info">
              <p className="url-card-domain">{item.domain}</p>
              <p className="url-card-page-title">{item.title}</p>
            </div>
          </div>
          <div className="url-card-content">
            <div className="url-card-highlights-count">{item.subtitle}</div>
            <div className="url-card-date">
              <span>{formatLastUpdatedTime(item.date)}</span>
            </div>
          </div>
          <DocumentCardMenu
            documentId={item.id}
            isArchived={false}
            onRename={async () => {
              // URL cards don't support rename yet
              console.log('Rename not supported for URL cards');
            }}
            onArchive={async () => {
              // URL cards don't support archive yet
              console.log('Archive not supported for URL cards');
            }}
            position={{ top: '7px', right: '6.56px' }}
          />
        </div>
      );
    }
    
    if (item.type === 'pdf') {
      // PDF/Physical document card
      return (
        <div 
          key={`pdf-${item.id}`}
          className="highlight-doc-card"
          onClick={() => handleItemClick(item)}
        >
          <div className="highlight-card-thumbnail">
            {item.thumbnail ? (
              <img src={item.thumbnail} alt={item.title} />
            ) : (
              <div className="highlight-card-thumbnail-placeholder">
                <BookOpenIconCard />
              </div>
            )}
          </div>
          <div className="highlight-card-content">
            <div className="highlight-card-info">
              <div className="highlight-card-icon">
                <BookOpenIconCard />
              </div>
              <div className="highlight-card-details">
                <p className="highlight-card-title">{item.title}</p>
                <p className="highlight-card-count">{item.subtitle}</p>
              </div>
            </div>
            <div className="highlight-card-date">
              <span>{formatLastUpdatedTime(item.date)}</span>
            </div>
          </div>
        </div>
      );
    }
    
    return null;
  };

  // Render a section with collapsible groups
  const renderSection = (label, items, sectionKey, isArchived = false) => {
    if (items.length === 0) return null;
    
    // Group items by type for the collapsible display
    const entriesInSection = items.filter(i => i.type === 'entry');
    const urlsInSection = items.filter(i => i.type === 'url');
    const pdfsInSection = items.filter(i => i.type === 'pdf');
    const isExpanded = isTimeSectionExpanded(sectionKey);
    
    return (
      <div className={`highlights-time-section ${isArchived ? 'archived' : ''}`}>
        {label && (
          <div 
            className="highlights-time-section-header"
            onClick={() => toggleTimeSection(sectionKey)}
          >
            <div className={`highlights-time-section-caret ${!isExpanded ? 'collapsed' : ''}`}>
              <CaretDownIcon />
            </div>
            <p className="highlights-section-label">{label}</p>
          </div>
        )}
        
        {(!label || isExpanded) && (
          <>
            {/* Entries group */}
            {entriesInSection.length > 0 && (
              <div className="highlights-document-group">
                <div 
                  className="highlights-group-header"
                  onClick={() => toggleGroup(`${sectionKey}-entries`)}
                >
                  <div className={`highlights-group-caret ${!isGroupExpanded(`${sectionKey}-entries`) ? 'collapsed' : ''}`}>
                    <CaretDownIcon />
                  </div>
                  <span className="highlights-group-title">Research Documents ({entriesInSection.length})</span>
                </div>
                {isGroupExpanded(`${sectionKey}-entries`) && (
                  <div className="highlights-cards-grid">
                    {entriesInSection.map(item => renderCard(item))}
                  </div>
                )}
              </div>
            )}
            
            {/* URLs group */}
            {urlsInSection.length > 0 && (
              <div className="highlights-document-group">
                <div 
                  className="highlights-group-header"
                  onClick={() => toggleGroup(`${sectionKey}-urls`)}
                >
                  <div className={`highlights-group-caret ${!isGroupExpanded(`${sectionKey}-urls`) ? 'collapsed' : ''}`}>
                    <CaretDownIcon />
                  </div>
                  <span className="highlights-group-title">Web Sources ({urlsInSection.length})</span>
                </div>
                {isGroupExpanded(`${sectionKey}-urls`) && (
                  <div className="highlights-cards-grid">
                    {urlsInSection.map(item => renderCard(item))}
                  </div>
                )}
              </div>
            )}
            
            {/* PDFs group */}
            {pdfsInSection.length > 0 && (
              <div className="highlights-document-group">
                <div 
                  className="highlights-group-header"
                  onClick={() => toggleGroup(`${sectionKey}-pdfs`)}
                >
                  <div className={`highlights-group-caret ${!isGroupExpanded(`${sectionKey}-pdfs`) ? 'collapsed' : ''}`}>
                    <CaretDownIcon />
                  </div>
                  <span className="highlights-group-title">Physical Sources ({pdfsInSection.length})</span>
                </div>
                {isGroupExpanded(`${sectionKey}-pdfs`) && (
                  <div className="highlights-cards-grid">
                    {pdfsInSection.map(item => renderCard(item))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="add-new-tab-view">
      {/* Top Action Buttons */}
      <div className="add-tab-action-buttons">
        <div 
          className="add-tab-action-button"
          onClick={onCreateNewDocument}
        >
          <div className="add-tab-button-icon">
            <FileDocumentIcon />
          </div>
          <span className="add-tab-button-label">Document Entries</span>
        </div>
        
        <div 
          className="add-tab-action-button disabled"
          title="Coming soon"
        >
          <div className="add-tab-button-icon">
            <GlobeIcon />
          </div>
          <span className="add-tab-button-label">Web Sources</span>
        </div>
        
        <div 
          className="add-tab-action-button"
          onClick={onUploadPdf}
        >
          <div className="add-tab-button-icon">
            <BookOpenIcon />
          </div>
          <span className="add-tab-button-label">Physical Sources</span>
        </div>
      </div>
      
      {/* Create New Button */}
      <div className="add-tab-create-new-wrapper">
        <button 
          className="add-tab-create-new-button"
          onClick={onCreateNewDocument}
        >
          <PlusIconSvg className="add-tab-create-new-icon" />
          <span className="add-tab-create-new-text">Create New</span>
        </button>
      </div>
      
      {/* Search Bar */}
      <div className="add-tab-search-bar">
        <div className="add-tab-search-icon">
          <SearchIcon />
        </div>
        <input
          type="text"
          className="add-tab-search-input"
          placeholder="Search for Files"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      {/* Content Grid */}
      <div className="add-tab-content-grid">
        {filteredItems.length === 0 ? (
          <div className="add-tab-empty-state">
            <p>No files found{searchQuery ? ` matching "${searchQuery}"` : ''}.</p>
            <p className="empty-hint">Create a new entry or upload a document to get started.</p>
          </div>
        ) : (
          <div className="add-tab-sections">
            {/* Items (sorted by date, newest first) */}
            {groupedItems.nonArchived.length > 0 && (
              <div className="highlights-time-section">
                {/* Entries group */}
                {groupedItems.nonArchived.filter(i => i.type === 'entry').length > 0 && (
                  <div className="highlights-document-group">
                    <div 
                      className="highlights-group-header"
                      onClick={() => toggleGroup('nonArchived-entries')}
                    >
                      <div className={`highlights-group-caret ${!isGroupExpanded('nonArchived-entries') ? 'collapsed' : ''}`}>
                        <CaretDownIcon />
                      </div>
                      <span className="highlights-group-title">Research Documents ({groupedItems.nonArchived.filter(i => i.type === 'entry').length})</span>
                    </div>
                    {isGroupExpanded('nonArchived-entries') && (
                      <div className="highlights-cards-grid">
                        {groupedItems.nonArchived.filter(i => i.type === 'entry').map(item => renderCard(item))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* URLs group */}
                {groupedItems.nonArchived.filter(i => i.type === 'url').length > 0 && (
                  <div className="highlights-document-group">
                    <div 
                      className="highlights-group-header"
                      onClick={() => toggleGroup('nonArchived-urls')}
                    >
                      <div className={`highlights-group-caret ${!isGroupExpanded('nonArchived-urls') ? 'collapsed' : ''}`}>
                        <CaretDownIcon />
                      </div>
                      <span className="highlights-group-title">Web Sources ({groupedItems.nonArchived.filter(i => i.type === 'url').length})</span>
                    </div>
                    {isGroupExpanded('nonArchived-urls') && (
                      <div className="highlights-cards-grid">
                        {groupedItems.nonArchived.filter(i => i.type === 'url').map(item => renderCard(item))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* PDFs group */}
                {groupedItems.nonArchived.filter(i => i.type === 'pdf').length > 0 && (
                  <div className="highlights-document-group">
                    <div 
                      className="highlights-group-header"
                      onClick={() => toggleGroup('nonArchived-pdfs')}
                    >
                      <div className={`highlights-group-caret ${!isGroupExpanded('nonArchived-pdfs') ? 'collapsed' : ''}`}>
                        <CaretDownIcon />
                      </div>
                      <span className="highlights-group-title">Physical Sources ({groupedItems.nonArchived.filter(i => i.type === 'pdf').length})</span>
                    </div>
                    {isGroupExpanded('nonArchived-pdfs') && (
                      <div className="highlights-cards-grid">
                        {groupedItems.nonArchived.filter(i => i.type === 'pdf').map(item => renderCard(item))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddNewTabView;

