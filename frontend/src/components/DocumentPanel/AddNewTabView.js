import React, { useState, useMemo, useCallback } from 'react';
import researchIcon from '../../assets/research-icon.svg';
import { ReactComponent as DocumentIconSvg } from '../../assets/document-icon.svg';
import { ReactComponent as WebIconSvg } from '../../assets/web-icon.svg';
import { ReactComponent as PdfIconSvg } from '../../assets/pdf-icon.svg';
import dropdownIcon from '../../assets/dropdown-icon.svg';
import plusIcon from '../../assets/plus-icon.svg';

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
  documentWordCounts = {},
  onCreateNewDocument,
  onOpenDocument,
  onOpenUrlHighlight,
  onOpenPdfDocument,
  onUploadPdf
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [failedFavicons, setFailedFavicons] = useState(new Set());
  
  // Format date for cards (e.g., "Nov 30th 2025 9:15pm")
  const formatHighlightDate = (dateString) => {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    
    const getOrdinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    
    return `${month} ${getOrdinal(day)} ${year} ${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
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
        subtitle: `${documentWordCounts[doc.document_id] !== undefined ? documentWordCounts[doc.document_id] + ' words' : 'Loading...'}`,
        date: doc.updated_at || doc.created_at,
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
  }, [researchDocuments, urlHighlights, pdfDocuments, documentWordCounts]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery) return getAllItems;
    return getAllItems.filter(item => 
      fuzzySearch(searchQuery, item.title) || 
      fuzzySearch(searchQuery, item.subtitle) ||
      (item.domain && fuzzySearch(searchQuery, item.domain))
    );
  }, [getAllItems, searchQuery]);

  // Group items by time period
  const groupedItems = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const groups = {
      today: [],
      last7Days: [],
      archived: []
    };
    
    filteredItems.forEach(item => {
      const itemDate = new Date(item.date);
      const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
      
      if (itemDateOnly >= today) {
        groups.today.push(item);
      } else if (itemDateOnly >= sevenDaysAgo) {
        groups.last7Days.push(item);
      } else {
        groups.archived.push(item);
      }
    });
    
    // Sort each group by date (newest first)
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(b.date) - new Date(a.date));
    });
    
    return groups;
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
            <div className="written-card-thumbnail-placeholder">
              <span className="txt-placeholder">TXT</span>
            </div>
          </div>
          <div className="written-card-content">
            <div className="written-card-info">
              <div className="written-card-icon">
                <FileDocumentIconCard />
              </div>
              <div className="written-card-details">
                <p className="written-card-title">{item.title}</p>
                <p className="written-card-count">{item.subtitle}</p>
              </div>
            </div>
            <div className="written-card-date">
              <span>Added <strong>{formatHighlightDate(item.date)}</strong></span>
            </div>
          </div>
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
            <div className="url-card-info">
              <div className="url-card-icon">
                <GlobeIconCard />
              </div>
              <div className="url-card-details">
                <p className="url-card-title">{item.title}</p>
                <p className="url-card-count">{item.subtitle}</p>
              </div>
            </div>
            <div className="url-card-date">
              <span>Added <strong>{formatHighlightDate(item.date)}</strong></span>
            </div>
          </div>
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
              <span>Added <strong>{formatHighlightDate(item.date)}</strong></span>
            </div>
          </div>
        </div>
      );
    }
    
    return null;
  };

  // Render a time section with collapsible groups
  const renderTimeSection = (label, items, sectionKey) => {
    if (items.length === 0) return null;
    
    // Group items by type for the collapsible display
    const entriesInSection = items.filter(i => i.type === 'entry');
    const urlsInSection = items.filter(i => i.type === 'url');
    const pdfsInSection = items.filter(i => i.type === 'pdf');
    
    return (
      <div className={`highlights-time-section ${sectionKey === 'archived' ? 'archived' : ''}`}>
        <p className="highlights-section-label">{label}</p>
        
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
            {renderTimeSection('TODAY', groupedItems.today, 'today')}
            {renderTimeSection('LAST 7 DAYS', groupedItems.last7Days, 'last7Days')}
            {renderTimeSection('ARCHIVED', groupedItems.archived, 'archived')}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddNewTabView;

