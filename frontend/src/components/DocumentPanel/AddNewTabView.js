import React, { useState, useMemo, useCallback } from 'react';

// Search icon for search bar
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M8.25 14.25C11.5637 14.25 14.25 11.5637 14.25 8.25C14.25 4.93629 11.5637 2.25 8.25 2.25C4.93629 2.25 2.25 4.93629 2.25 8.25C2.25 11.5637 4.93629 14.25 8.25 14.25Z" 
      stroke="rgba(0, 50, 98, 0.5)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M15.75 15.75L12.4875 12.4875" 
      stroke="rgba(0, 50, 98, 0.5)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// File/Document icon for Entries button
const FileDocumentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M11.6667 2.5H5.83333C5.39131 2.5 4.96738 2.67559 4.65482 2.98816C4.34226 3.30072 4.16667 3.72464 4.16667 4.16667V15.8333C4.16667 16.2754 4.34226 16.6993 4.65482 17.0118C4.96738 17.3244 5.39131 17.5 5.83333 17.5H14.1667C14.6087 17.5 15.0326 17.3244 15.3452 17.0118C15.6577 16.6993 15.8333 16.2754 15.8333 15.8333V6.66667L11.6667 2.5Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M11.6667 2.5V6.66667H15.8333" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Globe icon for Web Sources button
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

// Book Open icon for Physical Sources button
const BookOpenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M10 5.41667C10 4.5272 10 4.08246 9.87639 3.72236C9.67279 3.12709 9.2062 2.66051 8.61094 2.4569C8.25083 2.33333 7.8061 2.33333 6.91663 2.33333C5.58318 2.33333 4.91645 2.33333 4.39476 2.57832C3.93316 2.79598 3.54596 3.18318 3.3283 3.64478C3.08331 4.16647 3.08331 4.8332 3.08331 6.16667V15.4167C3.08331 14.5272 3.08331 14.0825 3.20693 13.7224C3.41054 13.1271 3.87712 12.6605 4.47238 12.4569C4.83248 12.3333 5.27722 12.3333 6.16669 12.3333H8.33331C8.80002 12.3333 9.03338 12.3333 9.21163 12.4242C9.36844 12.5047 9.49527 12.6316 9.57582 12.7884C9.66665 12.9666 9.66665 13.2 9.66665 13.6667V5.41667Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M10 5.41667C10 4.5272 10 4.08246 10.1236 3.72236C10.3272 3.12709 10.7938 2.66051 11.3891 2.4569C11.7492 2.33333 12.1939 2.33333 13.0834 2.33333C14.4168 2.33333 15.0836 2.33333 15.6052 2.57832C16.0668 2.79598 16.454 3.18318 16.6717 3.64478C16.9167 4.16647 16.9167 4.8332 16.9167 6.16667V15.4167C16.9167 14.5272 16.9167 14.0825 16.7931 13.7224C16.5895 13.1271 16.1229 12.6605 15.5276 12.4569C15.1675 12.3333 14.7228 12.3333 13.8333 12.3333H11.6667C11.2 12.3333 10.9666 12.3333 10.7884 12.4242C10.6316 12.5047 10.5047 12.6316 10.4242 12.7884C10.3333 12.9666 10.3333 13.2 10.3333 13.6667V5.41667Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// File/Document icon (20px) for card icons
const FileDocumentIconCard = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M11.6667 2.5H5.83333C5.39131 2.5 4.96738 2.67559 4.65482 2.98816C4.34226 3.30072 4.16667 3.72464 4.16667 4.16667V15.8333C4.16667 16.2754 4.34226 16.6993 4.65482 17.0118C4.96738 17.3244 5.39131 17.5 5.83333 17.5H14.1667C14.6087 17.5 15.0326 17.3244 15.3452 17.0118C15.6577 16.6993 15.8333 16.2754 15.8333 15.8333V6.66667L11.6667 2.5Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M11.6667 2.5V6.66667H15.8333" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Globe icon (20px) for URL cards from Figma - used with opacity 0.5 in cards
const GlobeIconCard = () => (
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

// Book Open icon (20px) for document cards from Figma
const BookOpenIconCard = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M10 5.41667C10 4.5272 10 4.08246 9.87639 3.72236C9.67279 3.12709 9.2062 2.66051 8.61094 2.4569C8.25083 2.33333 7.8061 2.33333 6.91663 2.33333C5.58318 2.33333 4.91645 2.33333 4.39476 2.57832C3.93316 2.79598 3.54596 3.18318 3.3283 3.64478C3.08331 4.16647 3.08331 4.8332 3.08331 6.16667V15.4167C3.08331 14.5272 3.08331 14.0825 3.20693 13.7224C3.41054 13.1271 3.87712 12.6605 4.47238 12.4569C4.83248 12.3333 5.27722 12.3333 6.16669 12.3333H8.33331C8.80002 12.3333 9.03338 12.3333 9.21163 12.4242C9.36844 12.5047 9.49527 12.6316 9.57582 12.7884C9.66665 12.9666 9.66665 13.2 9.66665 13.6667V5.41667Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M10 5.41667C10 4.5272 10 4.08246 10.1236 3.72236C10.3272 3.12709 10.7938 2.66051 11.3891 2.4569C11.7492 2.33333 12.1939 2.33333 13.0834 2.33333C14.4168 2.33333 15.0836 2.33333 15.6052 2.57832C16.0668 2.79598 16.454 3.18318 16.6717 3.64478C16.9167 4.16647 16.9167 4.8332 16.9167 6.16667V15.4167C16.9167 14.5272 16.9167 14.0825 16.7931 13.7224C16.5895 13.1271 16.1229 12.6605 15.5276 12.4569C15.1675 12.3333 14.7228 12.3333 13.8333 12.3333H11.6667C11.2 12.3333 10.9666 12.3333 10.7884 12.4242C10.6316 12.5047 10.5047 12.6316 10.4242 12.7884C10.3333 12.9666 10.3333 13.2 10.3333 13.6667V5.41667Z" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Caret Down icon (12px) from Figma
const CaretDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M4 5L6 7L8 5" 
      stroke="rgba(0, 25, 49, 1)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

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
          <span className="add-tab-button-label">Entries</span>
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

