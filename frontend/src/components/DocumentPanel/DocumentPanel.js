import React, { useState, useEffect, useRef, useCallback } from 'react';
import { documentAPI, projectAPI, highlightsAPI, pdfAPI } from '../../services/api';
import { getToken } from '../../utils/auth';
import DiffMatchPatch from 'diff-match-patch';
// Note: markdownToHtml is not needed here anymore - content is stored as HTML
// It's still used in ChatWindow.js for converting AI's Markdown output to HTML
import RichTextEditor from './RichTextEditor';
import AddNewTabView from './AddNewTabView';
import DocumentCardMenu from './DocumentCardMenu';
import CardMenu from './CardMenu';
import SectionHeader from './SectionHeader';
import './DocumentPanel.css';
import { ReactComponent as CancelIconSvg } from '../../assets/cancel-icon.svg';
import { ReactComponent as BackIconSvg } from '../../assets/back-icon.svg';
import { ReactComponent as ForwardIconSvg } from '../../assets/forward-icon.svg';
import { ReactComponent as RefreshIconSvg } from '../../assets/refresh-icon.svg';
import { ReactComponent as AttachIconSvg } from '../../assets/attach-icon.svg';
import { ReactComponent as PlusIconSvg } from '../../assets/plus-icon.svg';
import { ReactComponent as DropdownIconSvg } from '../../assets/dropdown-icon.svg';
import { ReactComponent as PdfIconSvg } from '../../assets/pdf-icon.svg';
import { ReactComponent as MenuIconSvg } from '../../assets/menu-icon.svg';
import { ReactComponent as VersionHistoryIconSvg } from '../../assets/versionhistory-icon.svg';
import { ReactComponent as DownloadIconSvg } from '../../assets/download-icon.svg';
import { ReactComponent as NewDocumentIconSvg } from '../../assets/newdocument-icon.svg';
import { ReactComponent as DocumentIconSvg } from '../../assets/document-icon.svg';
import { ReactComponent as WebIconSvg } from '../../assets/web-icon.svg';
import { ReactComponent as SearchIconSvg } from '../../assets/search.svg';
import { ReactComponent as ChevronMdSvg } from '../../assets/chevron-md.svg';
import highlightsImageIcon from '../../assets/highlights-image-icon.svg';
import highlightsPdfIcon from '../../assets/highlights-pdf-icon.svg';
import moreMenuIcon from '../../assets/document-menu-icons/More_Horizontal.svg';
import deleteIcon from '../../assets/delete-icon.svg';
import { getCacheKey, getCachedData, setCachedData, isCacheValid } from '../../utils/cache';

// Asset-based icon components
const CloseIcon = () => <CancelIconSvg className="dp-icon" />;
const ArrowLeftIcon = () => <BackIconSvg className="dp-icon" />;
const ArrowRightIcon = () => <ForwardIconSvg className="dp-icon" />;
const RefreshIcon = () => <RefreshIconSvg className="dp-icon" />;
const AttachIcon = () => <AttachIconSvg className="dp-icon" />;
const PlusIcon = () => <PlusIconSvg className="dp-icon" />;
const MenuIcon = () => <MenuIconSvg className="dp-icon" />;
const VersionHistoryIcon = () => <VersionHistoryIconSvg className="dp-menu-icon" />;
const DownloadIcon = () => <DownloadIconSvg className="dp-menu-icon" />;
const NewDocumentIcon = () => <NewDocumentIconSvg className="dp-newdoc-icon" />;
const DocumentIconEmpty = () => <DocumentIconSvg className="dp-doc-empty-icon" />;
const WebIcon = () => <WebIconSvg className="dp-web-icon" />;

// Share/Upload icon from Figma (Communication / Share_iOS_Export)
const ShareUploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M5.33337 6.66667H4.00004C3.64642 6.66667 3.30728 6.80714 3.05723 7.05719C2.80718 7.30724 2.66671 7.64638 2.66671 8V13.3333C2.66671 13.687 2.80718 14.0261 3.05723 14.2761C3.30728 14.5262 3.64642 14.6667 4.00004 14.6667H12C12.3537 14.6667 12.6928 14.5262 12.9428 14.2761C13.1929 14.0261 13.3334 13.687 13.3334 13.3333V8C13.3334 7.64638 13.1929 7.30724 12.9428 7.05719C12.6928 6.80714 12.3537 6.66667 12 6.66667H10.6667M8.00004 10.6667V1.33334M8.00004 1.33334L5.33337 4.00001M8.00004 1.33334L10.6667 4.00001" 
      stroke="white" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// PDF icon for document cards
const BookOpenIconCard = () => <PdfIconSvg className="add-tab-card-img" />;

// Caret Down icon
const CaretDownIcon = () => <DropdownIconSvg className="add-tab-caret-img" />;

// Large PDF icon for empty state
const BookIconLarge = () => <PdfIconSvg className="dp-icon-large" />;

// Globe icon (20px) for URL cards
const GlobeIconCard = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="globe-icon">
    <path 
      d="M10 18.333C14.6024 18.333 18.333 14.6024 18.333 10C18.333 5.39763 14.6024 1.66699 10 1.66699C5.39763 1.66699 1.66699 5.39763 1.66699 10C1.66699 14.6024 5.39763 18.333 10 18.333Z" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M1.66699 10H18.333" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M10 1.66699C12.0844 3.94863 13.269 6.91003 13.333 10C13.269 13.09 12.0844 16.0514 10 18.333C7.91562 16.0514 6.73106 13.09 6.66699 10C6.73106 6.91003 7.91562 3.94863 10 1.66699Z" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Large Globe icon for empty state
const GlobeIconLarge = () => (
  <svg width="50" height="50" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M32 58.6667C46.7276 58.6667 58.6667 46.7276 58.6667 32C58.6667 17.2724 46.7276 5.33337 32 5.33337C17.2724 5.33337 5.33337 17.2724 5.33337 32C5.33337 46.7276 17.2724 58.6667 32 58.6667Z" 
      stroke="var(--color-icon)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M5.33337 32H58.6667" 
      stroke="var(--color-icon)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M32 5.33337C38.6701 12.6357 42.4608 22.1121 42.6667 32C42.4608 41.888 38.6701 51.3644 32 58.6667C25.3299 51.3644 21.5392 41.888 21.3334 32C21.5392 22.1121 25.3299 12.6357 32 5.33337Z" 
      stroke="var(--color-icon)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// File/Document icon (20px) for Written Documents cards from Figma
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
    <path 
      d="M13.3333 10.8333H6.66667" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M13.3333 14.1667H6.66667" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M8.33333 7.5H7.5H6.66667" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Large File/Document icon for empty state and thumbnail placeholder
const FileDocumentIconLarge = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M37.3333 8H18.6667C17.2522 8 15.8956 8.5619 14.8954 9.5621C13.8952 10.5623 13.3333 11.9188 13.3333 13.3333V50.6667C13.3333 52.0812 13.8952 53.4377 14.8954 54.4379C15.8956 55.4381 17.2522 56 18.6667 56H45.3333C46.7478 56 48.1044 55.4381 49.1046 54.4379C50.1048 53.4377 50.6667 52.0812 50.6667 50.6667V21.3333L37.3333 8Z" 
      stroke="rgba(0, 50, 98, 0.4)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M37.3333 8V21.3333H50.6667" 
      stroke="rgba(0, 50, 98, 0.4)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M42.6667 34.6667H21.3333" 
      stroke="rgba(0, 50, 98, 0.4)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M42.6667 45.3333H21.3333" 
      stroke="rgba(0, 50, 98, 0.4)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M26.6667 24H24H21.3333" 
      stroke="rgba(0, 50, 98, 0.4)" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

const DocumentPanel = ({ refreshTrigger, selectedProjectId: propSelectedProjectId, currentProjectName: propCurrentProjectName, onAttachSections, onAttachHighlight, onActiveDocumentChange, onDocumentNameUpdate, highlightsTabTrigger, pdfTabTrigger, researchDocsTabTrigger, uploadTrigger, onEditorReady, onTabDataChange, isChatCollapsed = false }) => {
  const [documents, setDocuments] = useState([]); // All open documents
  const [activeDocumentId, setActiveDocumentId] = useState(null); // Currently active tab
  const [content, setContent] = useState(''); // Markdown content (storage format)
  const [htmlContent, setHtmlContent] = useState(''); // HTML content (for Quill editor)
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  
  // Refs for auto-save
  const editorRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const maxIntervalTimerRef = useRef(null);
  const lastSaveTimeRef = useRef(Date.now());
  const pendingContentRef = useRef(null);
  
  // Refs for delta save
  const lastSavedContentRef = useRef('');  // Content after last successful save
  const documentVersionRef = useRef(0);     // Version for optimistic locking
  const dmpRef = useRef(new DiffMatchPatch());  // diff-match-patch instance
  const lastSkipTimeRef = useRef(null);    // Timestamp when we last skipped a save
  const skipTimerRef = useRef(null);       // Timer for 10-second skip force save
  const skippedContentRef = useRef(null);  // Content that was skipped, to save when timer fires
  
  // Phase 2: Save queuing refs
  const saveInProgressRef = useRef(false); // Track if a save is currently in progress
  const pendingSaveQueueRef = useRef(null); // Queue for saves during active save
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDocumentList, setShowDocumentList] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(propSelectedProjectId);
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [activeTabId, setActiveTabId] = useState(null); // Can be document_id, highlights_tab_id, or pdf_tab_id
  const [activeTabType, setActiveTabType] = useState('document'); // 'document', 'highlights', or 'pdf'
  const [highlightsTabs, setHighlightsTabs] = useState([]); // Array of { id, selectedUrlData, createdAt }
  const [highlightsUrls, setHighlightsUrls] = useState([]); // URLs for current project
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  
  // PDF-related state
  const [pdfTabs, setPdfTabs] = useState([]); // Array of { id, selectedPdfData, createdAt }
  const [pdfs, setPdfs] = useState([]); // PDFs for current project
  const [pdfLoading, setPdfLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef(null);
  const sseEventSourceRef = useRef(null);
  const docMenuRef = useRef(null);
  const [isDocMenuOpen, setIsDocMenuOpen] = useState(false);
  // Track pending background refreshes to prevent duplicates
  const pendingBackgroundRefreshesRef = useRef(new Map()); // key -> timestamp
  // Track PDFs currently being extracted to prevent unnecessary GET requests
  const extractingPdfsRef = useRef(new Set()); // Set of pdf_id strings
  
  // Research Output Documents state
  const [researchDocsTabs, setResearchDocsTabs] = useState([]); // Array of { id, createdAt }
  
  // Pending new tab view state - shows the list view without creating an actual tab
  // Can be 'highlights', 'pdf', 'researchdocs', or null
  const [pendingNewTabType, setPendingNewTabType] = useState(null);
  
  // Tab order array - stores tab IDs in creation order for proper rendering
  // Each entry is { id: string, type: 'document' | 'highlights' | 'pdf' | 'researchdocs' }
  const [tabOrder, setTabOrder] = useState([]);
  
  // PDF highlight note editing state
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isEditingDocumentName, setIsEditingDocumentName] = useState(false);
  const [editingDocumentName, setEditingDocumentName] = useState('');
  const [expandedTimeSections, setExpandedTimeSections] = useState({
    nonArchived: true,
    archive: true
  });
  const [expandedUrlTimeSections, setExpandedUrlTimeSections] = useState({
    nonArchived: true,
    archived: true
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [urlSearchQuery, setUrlSearchQuery] = useState('');
  const [pdfSearchQuery, setPdfSearchQuery] = useState('');
  const [visibleRowsCount, setVisibleRowsCount] = useState(15); // Lazy loading: start with 15 rows
  const tableScrollRef = useRef(null);
  const [openSourceMenuId, setOpenSourceMenuId] = useState(null); // Track which source menu is open
  const sourceMenuRefs = useRef({}); // Refs for menu dropdowns

  // Ref to track if we've restored tabs from localStorage (prevents saving empty arrays on mount)
  const hasRestoredTabsRef = useRef(false);
  const restoredProjectIdRef = useRef(null);

  // Set up SSE connection for real-time extraction status updates (closed-loop system)
  useEffect(() => {
    if (!selectedProjectId) {
      // Close SSE connection if no project selected
      if (sseEventSourceRef.current) {
        console.log('[SSE] Closing connection - no project selected');
        sseEventSourceRef.current.close();
        sseEventSourceRef.current = null;
      }
      return;
    }

    // Get token first - if no token, can't connect
    const token = getToken();
    if (!token) {
      console.warn('[SSE] No token available, skipping SSE connection');
      return;
    }

    // Set up SSE connection
    const eventSourceUrl = pdfAPI.getSSEEventSourceUrl();
    console.log('[SSE] Connecting to:', eventSourceUrl.replace(/token=[^&]+/, 'token=***'));
    
    let eventSource;
    try {
      eventSource = new EventSource(eventSourceUrl);
      sseEventSourceRef.current = eventSource;
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      return;
    }

    // Handle connection open
    eventSource.onopen = () => {
      console.log('[SSE] Connection established successfully');
    };

    // Handle incoming events
    eventSource.onmessage = (event) => {
      try {
        // Skip keepalive pings
        if (event.data.trim() === '' || event.data.startsWith(':')) {
          return;
        }
        
        const data = JSON.parse(event.data);
        console.log('[SSE] Received event:', data);

        if (data.type === 'extraction_complete') {
          // Extraction completed - refresh PDFs list immediately
          console.log('[SSE] Extraction complete for PDF:', data.data.pdf_id);
          // Remove from extracting set
          extractingPdfsRef.current.delete(data.data.pdf_id);
          if (selectedProjectId) {
            // Force refresh with cache bypass - add timestamp to ensure fresh data
            console.log('[SSE] Forcing PDF list refresh after extraction completion');
            // Small delay to ensure backend cache invalidation has propagated
            setTimeout(() => {
              loadPdfsForProject(selectedProjectId, true);
            }, 500);
          }
        } else if (data.type === 'extraction_failed') {
          // Extraction failed - refresh to show error status
          console.log('[SSE] Extraction failed for PDF:', data.data.pdf_id);
          // Remove from extracting set
          extractingPdfsRef.current.delete(data.data.pdf_id);
          if (selectedProjectId) {
            loadPdfsForProject(selectedProjectId, true);
          }
        } else if (data.type === 'extraction_started') {
          // Extraction started - update UI to show processing status
          console.log('[SSE] Extraction started for PDF:', data.data.pdf_id);
          // Track that this PDF is being extracted
          extractingPdfsRef.current.add(data.data.pdf_id);
          // Update the specific PDF in the list to show processing status
          setPdfs(prev => prev.map(pdf => 
            pdf.pdf_id === data.data.pdf_id 
              ? { ...pdf, extraction_status: 'processing' }
              : pdf
          ));
        } else if (data.type === 'highlight_saved') {
          // Highlight saved - refresh highlights list immediately
          console.log('[SSE] Highlight saved for project:', data.data.project_id);
          if (selectedProjectId && selectedProjectId === data.data.project_id) {
            // Invalidate localStorage cache to ensure fresh data
            const cacheKey = getCacheKey('highlights', selectedProjectId);
            try {
              localStorage.removeItem(cacheKey);
              console.log('[SSE] Invalidated localStorage cache for highlights');
            } catch (e) {
              console.warn('[SSE] Failed to invalidate cache:', e);
            }
            // Force refresh - add small delay to ensure backend cache invalidation has propagated
            console.log('[SSE] Forcing highlights list refresh after highlight save');
            setTimeout(() => {
              loadHighlightsForProject(selectedProjectId);
            }, 500);
          }
        } else if (data.type === 'connected') {
          console.log('[SSE] Server confirmed connection:', data.message);
        }
      } catch (err) {
        console.error('[SSE] Error parsing event data:', err, 'Raw data:', event.data);
      }
    };

    // Handle connection errors
    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      console.error('[SSE] EventSource readyState:', eventSource.readyState);
      // readyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
      if (eventSource.readyState === EventSource.CLOSED) {
        console.error('[SSE] Connection closed, will not auto-reconnect');
        // Clean up
        if (sseEventSourceRef.current === eventSource) {
          sseEventSourceRef.current = null;
        }
      }
      // EventSource will automatically attempt to reconnect if readyState is CONNECTING
    };

    // Cleanup on unmount or project change
    return () => {
      if (eventSource) {
        console.log('[SSE] Closing connection (cleanup)');
        eventSource.close();
        if (sseEventSourceRef.current === eventSource) {
          sseEventSourceRef.current = null;
        }
      }
    };
  }, [selectedProjectId]); // Reconnect when project changes

  // Refresh PDFs list when user switches to sources/PDF tab (event-driven, no polling)
  // Only refresh if there are processing PDFs AND we're not already tracking them via SSE
  useEffect(() => {
    if (activeTabType === 'pdf' && selectedProjectId) {
      // User switched to sources tab - check once if any PDFs are processing
      // But don't refresh if we're already tracking them via SSE (they'll be updated when extraction completes)
      const hasProcessingPdfs = pdfs.some(pdf => 
        (pdf.extraction_status === 'processing' || pdf.extraction_status === 'pending') &&
        !extractingPdfsRef.current.has(pdf.pdf_id)
      );
      if (hasProcessingPdfs) {
        // Only refresh if we're not already tracking these PDFs via SSE
        console.log('[TAB SWITCH] Refreshing PDFs list - found processing PDFs not tracked by SSE');
        loadPdfsForProject(selectedProjectId, true);
      } else {
        console.log('[TAB SWITCH] No refresh needed - all processing PDFs are tracked by SSE or none processing');
      }
    }
  }, [activeTabType]); // Only when user switches tabs (user action), not continuously

  // Helper function to get localStorage key for tabs (per project)
  const getTabsStorageKey = (projectId) => {
    return projectId ? `tabs_${projectId}` : null;
  };

  // Helper function to get localStorage key for active tab (per project)
  const getActiveTabStorageKey = (projectId) => {
    return projectId ? `activeTab_${projectId}` : null;
  };

  // Restore tabs from localStorage when selectedProjectId is set (after prop sync)
  useEffect(() => {
    if (!selectedProjectId) {
      hasRestoredTabsRef.current = false;
      restoredProjectIdRef.current = null;
      return;
    }

    // If we've already restored for this project, don't restore again
    if (hasRestoredTabsRef.current && restoredProjectIdRef.current === selectedProjectId) {
      return;
    }

    const tabsKey = getTabsStorageKey(selectedProjectId);
    const activeTabKey = getActiveTabStorageKey(selectedProjectId);
    let restoredActiveDocumentId = null;
    let restoredActiveTabType = 'document';
    let restoredActiveTabId = null;

    if (tabsKey) {
      try {
        const savedTabs = localStorage.getItem(tabsKey);
        if (savedTabs) {
          const tabsData = JSON.parse(savedTabs);
          
          // Restore tab arrays (restore even if empty, to maintain state)
          if (tabsData.documents && Array.isArray(tabsData.documents)) {
            setDocuments(tabsData.documents);
          }
          if (tabsData.highlightsTabs && Array.isArray(tabsData.highlightsTabs)) {
            setHighlightsTabs(tabsData.highlightsTabs);
          }
          if (tabsData.pdfTabs && Array.isArray(tabsData.pdfTabs)) {
            setPdfTabs(tabsData.pdfTabs);
          }
          if (tabsData.researchDocsTabs && Array.isArray(tabsData.researchDocsTabs)) {
            setResearchDocsTabs(tabsData.researchDocsTabs);
          }
          if (tabsData.tabOrder && Array.isArray(tabsData.tabOrder)) {
            setTabOrder(tabsData.tabOrder);
          }
        }
      } catch (err) {
        console.error('Failed to restore tabs from localStorage:', err);
      }
    }

    if (activeTabKey) {
      try {
        const savedActiveTab = localStorage.getItem(activeTabKey);
        if (savedActiveTab) {
          const activeTabData = JSON.parse(savedActiveTab);
          
          // Store restored values to set them after state updates
          if (activeTabData.activeTabId !== undefined) {
            restoredActiveTabId = activeTabData.activeTabId;
          }
          if (activeTabData.activeTabType) {
            restoredActiveTabType = activeTabData.activeTabType;
          }
          if (activeTabData.activeDocumentId !== undefined) {
            restoredActiveDocumentId = activeTabData.activeDocumentId;
          }
        }
      } catch (err) {
        console.error('Failed to restore active tab from localStorage:', err);
      }
    }

    // Restore active tab state after a brief delay to ensure documents are set first
    if (restoredActiveTabId !== null || restoredActiveDocumentId !== null) {
      // Use setTimeout to ensure state updates are processed
      setTimeout(() => {
        if (restoredActiveTabId !== null) {
          setActiveTabId(restoredActiveTabId);
        }
        if (restoredActiveTabType) {
          setActiveTabType(restoredActiveTabType);
        }
        if (restoredActiveDocumentId !== null) {
          setActiveDocumentId(restoredActiveDocumentId);
          // Hide document list when we have an active document
          setShowDocumentList(false);
        }
      }, 10); // Small delay to ensure state updates are processed
    } else {
      // If no active document was restored but we have documents, show the list
      // This will be handled by the useEffect that watches documents.length
    }

    // Mark that we've restored tabs for this project (even if no tabs were saved)
    hasRestoredTabsRef.current = true;
    restoredProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  // Sync with prop selectedProjectId - this is the primary source of truth
  useEffect(() => {
    if (propSelectedProjectId) {
      setSelectedProjectId(propSelectedProjectId);
      loadAvailableDocuments(propSelectedProjectId);
      loadHighlightsForProject(propSelectedProjectId);
      loadPdfsForProject(propSelectedProjectId);
    }
  }, [propSelectedProjectId]);

  // Save tabs to localStorage whenever tab state changes
  useEffect(() => {
    if (!selectedProjectId) return;

    // Don't save if we haven't restored tabs yet (prevents overwriting with empty arrays on mount)
    if (!hasRestoredTabsRef.current || restoredProjectIdRef.current !== selectedProjectId) {
      return;
    }

    // Don't save on initial selectedProjectId change - only save when tab arrays actually change
    // This prevents saving empty arrays before restore completes
    const tabsKey = getTabsStorageKey(selectedProjectId);
    if (tabsKey) {
      try {
        const tabsData = {
          documents,
          highlightsTabs,
          pdfTabs,
          researchDocsTabs,
          tabOrder
        };
        localStorage.setItem(tabsKey, JSON.stringify(tabsData));
      } catch (err) {
        console.error('Failed to save tabs to localStorage:', err);
      }
    }
  }, [documents, highlightsTabs, pdfTabs, researchDocsTabs, tabOrder, selectedProjectId]);

  // Save active tab state to localStorage whenever it changes
  useEffect(() => {
    if (!selectedProjectId) return;

    // Don't save if we haven't restored tabs yet (prevents overwriting on mount)
    if (!hasRestoredTabsRef.current || restoredProjectIdRef.current !== selectedProjectId) {
      return;
    }

    // Don't save on initial selectedProjectId change - only save when active tab actually changes
    const activeTabKey = getActiveTabStorageKey(selectedProjectId);
    if (activeTabKey) {
      try {
        const activeTabData = {
          activeTabId,
          activeTabType,
          activeDocumentId
        };
        localStorage.setItem(activeTabKey, JSON.stringify(activeTabData));
      } catch (err) {
        console.error('Failed to save active tab to localStorage:', err);
      }
    }
  }, [activeTabId, activeTabType, activeDocumentId, selectedProjectId]);

  // Show document list when no documents are open (but not if we have an active document)
  useEffect(() => {
    if (documents.length === 0 && selectedProjectId && !activeDocumentId) {
      setShowDocumentList(true);
    } else if (activeDocumentId && documents.length > 0) {
      // If we have an active document, hide the document list
      setShowDocumentList(false);
    }
  }, [documents.length, selectedProjectId, activeDocumentId]);

  // Close the document options dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (docMenuRef.current && !docMenuRef.current.contains(event.target)) {
        setIsDocMenuOpen(false);
      }
      
      // Close source menu if clicking outside
      if (openSourceMenuId !== null) {
        const menuRef = sourceMenuRefs.current[openSourceMenuId];
        const buttonRef = event.target.closest('.source-menu-button');
        if (menuRef && !menuRef.contains(event.target) && !buttonRef) {
          setOpenSourceMenuId(null);
        }
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsDocMenuOpen(false);
        setOpenSourceMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keyup', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keyup', handleEscape);
    };
  }, [openSourceMenuId]);


  // Load available documents for the project
  const loadAvailableDocuments = async (projectId) => {
    const ttl = 300; // 5 minutes
    const minBackgroundRefreshInterval = 30; // 30 seconds minimum between background refreshes
    try {
      console.log('[CACHE] loadAvailableDocuments: Cache check');
      const key = getCacheKey('documents', projectId);
      const cached = getCachedData(key);
      if (cached && isCacheValid(cached, ttl)) {
        console.log('[CACHE] loadAvailableDocuments: Cache hit, showing UI immediately');
        const docs = cached.data || [];
        setAvailableDocuments(docs);
        setError('');
        // Background refresh - only if not already pending or recently refreshed
        const now = Date.now();
        const lastRefresh = pendingBackgroundRefreshesRef.current.get(key) || 0;
        const timeSinceLastRefresh = (now - lastRefresh) / 1000; // seconds
        if (timeSinceLastRefresh >= minBackgroundRefreshInterval) {
          console.log('[CACHE] loadAvailableDocuments: Fetching fresh data in background');
          pendingBackgroundRefreshesRef.current.set(key, now);
          documentAPI.getAllResearchDocuments(projectId)
            .then((response) => {
              const freshDocs = response.data.documents || [];
              setAvailableDocuments(freshDocs);
              console.log('[CACHE] loadAvailableDocuments: Caching fresh data');
              setCachedData(key, freshDocs, ttl);
            })
            .catch((err) => {
              console.error('Failed background refresh for documents:', err);
            })
            .finally(() => {
              // Keep the timestamp so we don't refresh too frequently
            });
        } else {
          console.log(`[CACHE] loadAvailableDocuments: Skipping background refresh (refreshed ${Math.floor(timeSinceLastRefresh)}s ago, min interval: ${minBackgroundRefreshInterval}s)`);
        }
        return;
      }
      console.log('[CACHE] loadAvailableDocuments: Cache miss, fetching from API');
      const response = await documentAPI.getAllResearchDocuments(projectId);
      const docs = response.data.documents || [];
      setAvailableDocuments(docs);
      setError(''); // Clear any previous errors
      console.log('[CACHE] loadAvailableDocuments: Caching fresh data');
      setCachedData(key, docs, ttl);
      // Update refresh timestamp for cache miss too
      pendingBackgroundRefreshesRef.current.set(key, Date.now());
    } catch (err) {
      console.error('Failed to load available documents:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load documents';
      setError(errorMessage);
    }
  };

  // Show pending highlights view when trigger changes (no tab created yet)
  // NOTE: This is now handled by pdfTabTrigger - web highlights are shown in PDF tab
  // Keeping this for backward compatibility but redirecting to PDF tab
  useEffect(() => {
    if (highlightsTabTrigger > 0) {
      // Redirect to PDF tab which now shows both PDF and web highlights
      setPendingNewTabType('pdf');
      setActiveTabId(null);
      setActiveTabType('pdf');
      
      if (selectedProjectId) {
        loadPdfsForProject(selectedProjectId);
        loadHighlightsForProject(selectedProjectId);
      }
    }
  }, [highlightsTabTrigger]);

  // Show pending PDF view when trigger changes (no tab created yet)
  useEffect(() => {
    if (pdfTabTrigger > 0) {
      // Just show the pending view - don't create a tab yet
      setPendingNewTabType('pdf');
      setActiveTabId(null);
      setActiveTabType('pdf');
      
      if (selectedProjectId) {
        loadPdfsForProject(selectedProjectId);
      }
    }
  }, [pdfTabTrigger]);

  // Auto-trigger upload dialog when uploadTrigger changes (from @ mention "Add New Source")
  useEffect(() => {
    if (uploadTrigger > 0 && fileInputRef.current) {
      // Trigger file input click to open upload dialog
      fileInputRef.current.click();
    }
  }, [uploadTrigger]);

  // Show pending Research Docs view when trigger changes (no tab created yet)
  useEffect(() => {
    if (researchDocsTabTrigger > 0) {
      // Just show the pending view - don't create a tab yet
      setPendingNewTabType('researchdocs');
      setActiveTabId(null);
      setActiveTabType('researchdocs');
      
      if (selectedProjectId) {
        loadAvailableDocuments(selectedProjectId);
      }
    }
  }, [researchDocsTabTrigger]);

  // Load highlights (URLs) for current project
  const loadHighlightsForProject = async (projectId) => {
    const ttl = 300; // 5 minutes
    const minBackgroundRefreshInterval = 30; // 30 seconds minimum between background refreshes
    try {
      console.log('[CACHE] loadHighlightsForProject: Cache check');
      const key = getCacheKey('highlights', projectId);
      const cached = getCachedData(key);
      if (cached && isCacheValid(cached, ttl)) {
        console.log('[CACHE] loadHighlightsForProject: Cache hit, showing UI immediately');
        setHighlightsUrls(cached.data || []);
        setHighlightsLoading(false);
        // Background refresh - only if not already pending or recently refreshed
        const now = Date.now();
        const lastRefresh = pendingBackgroundRefreshesRef.current.get(key) || 0;
        const timeSinceLastRefresh = (now - lastRefresh) / 1000; // seconds
        if (timeSinceLastRefresh >= minBackgroundRefreshInterval) {
          console.log('[CACHE] loadHighlightsForProject: Fetching fresh data in background');
          pendingBackgroundRefreshesRef.current.set(key, now);
          highlightsAPI.getHighlights(projectId)
            .then((response) => {
              const fresh = response.data.highlights || [];
              setHighlightsUrls(fresh);
              console.log('[CACHE] loadHighlightsForProject: Caching fresh data');
              setCachedData(key, fresh, ttl);
            })
            .catch((err) => {
              console.error('Failed background refresh for highlights:', err);
            });
        } else {
          console.log(`[CACHE] loadHighlightsForProject: Skipping background refresh (refreshed ${Math.floor(timeSinceLastRefresh)}s ago, min interval: ${minBackgroundRefreshInterval}s)`);
        }
        return;
      }
      setHighlightsLoading(true);
      console.log('[CACHE] loadHighlightsForProject: Cache miss, fetching from API');
      const response = await highlightsAPI.getHighlights(projectId);
      const data = response.data.highlights || [];
      setHighlightsUrls(data);
      console.log('[CACHE] loadHighlightsForProject: Caching fresh data');
      setCachedData(key, data, ttl);
      // Update refresh timestamp for cache miss too
      pendingBackgroundRefreshesRef.current.set(key, Date.now());
    } catch (err) {
      console.error('Failed to load highlights:', err);
      setError('Failed to load highlights.');
    } finally {
      setHighlightsLoading(false);
    }
  };

  // Load PDFs for current project
  const loadPdfsForProject = async (projectId, forceRefresh = false) => {
    const ttl = 300; // 5 minutes
    const minBackgroundRefreshInterval = 10; // 10 seconds minimum between background refreshes (reduced from 30)
    try {
      const key = getCacheKey('pdfs', projectId);
      
      // If force refresh, clear cache and fetch fresh
      if (forceRefresh) {
        console.log('[CACHE] loadPdfsForProject: Force refresh, clearing cache');
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn('Failed to clear cache:', e);
        }
        setPdfLoading(true);
        const response = await pdfAPI.getPDFs(projectId);
        const data = response.data.pdfs || [];
        
        // Log extraction_status for each PDF to debug
        data.forEach(pdf => {
          console.log(`[PDF] ${pdf.filename || pdf.pdf_id}: extraction_status=${pdf.extraction_status}, highlights=${pdf.highlights?.length || 0}`);
        });
        
        setPdfs(data);
        console.log('[CACHE] loadPdfsForProject: Caching fresh data (force refresh)');
        setCachedData(key, data, ttl);
        pendingBackgroundRefreshesRef.current.set(key, Date.now());
        setPdfLoading(false);
        return;
      }
      
      console.log('[CACHE] loadPdfsForProject: Cache check');
      const cached = getCachedData(key);
      if (cached && isCacheValid(cached, ttl)) {
        console.log('[CACHE] loadPdfsForProject: Cache hit, showing UI immediately');
        setPdfs(cached.data || []);
        setPdfLoading(false);
        
        // Check if any PDFs are currently being extracted
        const hasExtractingPdfs = cached.data?.some(pdf => 
          pdf.extraction_status === 'processing' || 
          pdf.extraction_status === 'pending' ||
          extractingPdfsRef.current.has(pdf.pdf_id)
        );
        
        // Background refresh - only if:
        // 1. Not already pending or recently refreshed
        // 2. No PDFs are currently being extracted (SSE will notify us when done)
        const now = Date.now();
        const lastRefresh = pendingBackgroundRefreshesRef.current.get(key) || 0;
        const timeSinceLastRefresh = (now - lastRefresh) / 1000; // seconds
        
        if (hasExtractingPdfs) {
          console.log('[CACHE] loadPdfsForProject: Skipping background refresh - PDFs are being extracted (SSE will notify when done)');
        } else if (timeSinceLastRefresh >= minBackgroundRefreshInterval) {
          console.log('[CACHE] loadPdfsForProject: Fetching fresh data in background');
          pendingBackgroundRefreshesRef.current.set(key, now);
          pdfAPI.getPDFs(projectId)
            .then((response) => {
              const fresh = response.data.pdfs || [];
              setPdfs(fresh);
              console.log('[CACHE] loadPdfsForProject: Caching fresh data');
              setCachedData(key, fresh, ttl);
            })
            .catch((err) => {
              console.error('Failed background refresh for PDFs:', err);
            });
        } else {
          console.log(`[CACHE] loadPdfsForProject: Skipping background refresh (refreshed ${Math.floor(timeSinceLastRefresh)}s ago, min interval: ${minBackgroundRefreshInterval}s)`);
        }
        return;
      }
      setPdfLoading(true);
      console.log('[CACHE] loadPdfsForProject: Cache miss, fetching from API');
      const response = await pdfAPI.getPDFs(projectId);
      const data = response.data.pdfs || [];
      setPdfs(data);
      console.log('[CACHE] loadPdfsForProject: Caching fresh data');
      setCachedData(key, data, ttl);
      // Update refresh timestamp for cache miss too
      pendingBackgroundRefreshesRef.current.set(key, Date.now());
    } catch (err) {
      console.error('Failed to load PDFs:', err);
      setError('Failed to load PDFs.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePdfClick = async (pdf) => {
    try {
      // Set PDF data immediately (so PDF viewer can start loading)
      const initialData = {
        projectId: selectedProjectId,
        pdf,
        highlights: [],
        extractionStatus: 'pending',
        extractionError: null
      };
      
      // If we're in pending state (no tab created yet), create a new tab with the selected data
      if (pendingNewTabType === 'pdf') {
        const newTabId = `pdf-${Date.now()}`;
        const newTab = { id: newTabId, selectedPdfData: initialData, createdAt: Date.now() };
        setPdfTabs(prev => [...prev, newTab]);
        setTabOrder(prev => [...prev, { id: newTabId, type: 'pdf' }]);
        setActiveTabId(newTabId);
        setPendingNewTabType(null); // Clear pending state
      } else {
        // Update the selectedPdfData for the active PDF tab immediately
        setPdfTabs(prev => prev.map(tab => 
          tab.id === activeTabId ? { ...tab, selectedPdfData: initialData } : tab
        ));
      }
      
      // Then fetch highlights in the background (non-blocking)
      try {
        const highlightsResponse = await pdfAPI.getHighlights(pdf.pdf_id);
        const selectedData = {
          projectId: selectedProjectId,
          pdf,
          highlights: highlightsResponse.data.highlights || [],
          extractionStatus: highlightsResponse.data.extraction_status,
          extractionError: highlightsResponse.data.extraction_error
        };
        
        // Update with full data including highlights
        setPdfTabs(prev => prev.map(tab => 
          tab.id === activeTabId ? { ...tab, selectedPdfData: selectedData } : tab
        ));
      } catch (err) {
        console.error('Failed to load PDF highlights:', err);
        // Update with error state but keep PDF loaded
        setPdfTabs(prev => prev.map(tab => 
          tab.id === activeTabId ? { 
            ...tab, 
            selectedPdfData: {
              ...tab.selectedPdfData,
              extractionStatus: 'failed',
              extractionError: 'Failed to load highlights'
            }
          } : tab
        ));
      }
    } catch (err) {
      console.error('Failed to load PDF:', err);
      setError('Failed to load PDF.');
    }
  };

  const handleBackToPdfTable = () => {
    // Clear selectedPdfData for the active PDF tab
    setPdfTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, selectedPdfData: null } : tab
    ));
  };

  // Get active PDF tab data
  const getActivePdfTab = () => {
    return pdfTabs.find(tab => tab.id === activeTabId);
  };

  // Get selected PDF data for the active PDF tab
  const getSelectedPdfData = () => {
    const activeTab = getActivePdfTab();
    return activeTab?.selectedPdfData || null;
  };

  // Handle PDF file upload
  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const fileName = file.name.toLowerCase();
    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidFile) {
      setError('Please select a PDF, JPG, or PNG file');
      return;
    }

    if (!selectedProjectId) {
      setError('No project selected');
      return;
    }

    try {
      setUploadingPdf(true);
      setError('');
      
      const response = await pdfAPI.uploadPDF(selectedProjectId, file);
      const pdfId = response.data?.pdf_id;
      
      // Track that this PDF is being extracted (SSE will notify when done)
      if (pdfId) {
        extractingPdfsRef.current.add(pdfId);
        console.log('[UPLOAD] Tracking PDF extraction:', pdfId);
      }
      
      // Invalidate PDFs cache
      try {
        console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
        const keys = [getCacheKey('pdfs', selectedProjectId)];
        keys.forEach(k => localStorage.removeItem(k));
        console.log('[CACHE] Cleared cache keys:', keys);
      } catch (e) {
        console.warn('Failed to invalidate cache after PDF upload:', e);
      }
      
      // Reload PDFs for the project (one time after upload)
      await loadPdfsForProject(selectedProjectId, true); // Force refresh
      
      // No additional refreshes needed - SSE will notify us when extraction completes
      // The SSE connection (set up in useEffect) will automatically refresh the list
      // when it receives the 'extraction_complete' event from the backend
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Failed to upload PDF:', err);
      setError(err.response?.data?.error || 'Failed to upload PDF');
    } finally {
      setUploadingPdf(false);
    }
  };

  // Handle PDF delete
  const handleDeletePdf = async (pdfId) => {
    if (!window.confirm('Are you sure you want to delete this PDF?')) {
      return;
    }

    try {
      await pdfAPI.deletePDF(pdfId);
      // Remove from extracting set if it was being tracked
      extractingPdfsRef.current.delete(pdfId);
      // Invalidate PDFs cache
      try {
        console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
        const keys = [getCacheKey('pdfs', selectedProjectId)];
        keys.forEach(k => localStorage.removeItem(k));
        console.log('[CACHE] Cleared cache keys:', keys);
      } catch (e) {
        console.warn('Failed to invalidate cache after PDF delete:', e);
      }
      if (selectedProjectId) {
        await loadPdfsForProject(selectedProjectId);
      }
    } catch (err) {
      console.error('Failed to delete PDF:', err);
      setError('Failed to delete PDF');
    }
  };

  // Handle PDF highlight delete
  const handleDeletePdfHighlight = async (pdfId, highlightId) => {
    if (!window.confirm('Are you sure you want to delete this highlight?')) {
      return;
    }

    try {
      await pdfAPI.deleteHighlight(pdfId, highlightId);
      
      // Invalidate highlights cache
      try {
        console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
        const keys = [getCacheKey('highlights', selectedProjectId)];
        keys.forEach(k => localStorage.removeItem(k));
        console.log('[CACHE] Cleared cache keys:', keys);
      } catch (e) {
        console.warn('Failed to invalidate cache after PDF highlight delete:', e);
      }
      
      // Update the selected PDF data
      const activePdfTab = getActivePdfTab();
      if (activePdfTab?.selectedPdfData) {
        const updatedHighlights = activePdfTab.selectedPdfData.highlights.filter(
          h => h.highlight_id !== highlightId
        );
        setPdfTabs(prev => prev.map(tab => 
          tab.id === activeTabId ? {
            ...tab,
            selectedPdfData: {
              ...tab.selectedPdfData,
              highlights: updatedHighlights
            }
          } : tab
        ));
      }
    } catch (err) {
      console.error('Failed to delete PDF highlight:', err);
      setError('Failed to delete PDF highlight');
    }
  };

  // Handle re-extract highlights
  const handleReextractHighlights = async (pdfId) => {
    try {
      await pdfAPI.reextractHighlights(pdfId);
      setError('');
      
      // Update status to processing
      setPdfTabs(prev => prev.map(tab => 
        tab.id === activeTabId && tab.selectedPdfData?.pdf?.pdf_id === pdfId ? {
          ...tab,
          selectedPdfData: {
            ...tab.selectedPdfData,
            extractionStatus: 'processing'
          }
        } : tab
      ));
    } catch (err) {
      console.error('Failed to re-extract highlights:', err);
      setError('Failed to re-extract highlights');
    }
  };

  // Refresh PDF highlights
  const handleRefreshPdfHighlights = async () => {
    const pdfData = getSelectedPdfData();
    if (!pdfData) return;

    try {
      const response = await pdfAPI.getHighlights(pdfData.pdf.pdf_id);
      setPdfTabs(prev => prev.map(tab => 
        tab.id === activeTabId ? {
          ...tab,
          selectedPdfData: {
            ...tab.selectedPdfData,
            highlights: response.data.highlights || [],
            extractionStatus: response.data.extraction_status,
            extractionError: response.data.extraction_error
          }
        } : tab
      ));
    } catch (err) {
      console.error('Failed to refresh PDF highlights:', err);
      setError('Failed to refresh highlights');
    }
  };

  // Get color class for highlight
  const getColorClass = (colorTag) => {
    const colorMap = {
      yellow: 'highlight-color-yellow',
      orange: 'highlight-color-orange',
      pink: 'highlight-color-pink',
      red: 'highlight-color-red',
      green: 'highlight-color-green',
      blue: 'highlight-color-blue',
      purple: 'highlight-color-purple'
    };
    return colorMap[colorTag] || 'highlight-color-yellow';
  };

  // Get icon for document type based on filename
  const getDocumentIcon = (filename) => {
    if (!filename) return '📄';
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return '📄';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '🖼️';
    if (lower.endsWith('.png')) return '🖼️';
    return '📄';
  };

  // Attach a web highlight to chat
  const handleAttachWebHighlight = (highlight, urlDoc) => {
    if (!onAttachHighlight) return;
    
    const attachedHighlight = {
      id: `web-${highlight.highlight_id}`,
      type: 'web',
      text: highlight.text,
      note: highlight.note,
      tags: highlight.tags,
      source: urlDoc.source_url,
      sourceTitle: urlDoc.page_title,
      timestamp: highlight.timestamp
    };
    
    onAttachHighlight(attachedHighlight);
  };

  // Attach a PDF/image highlight to chat
  const handleAttachPdfHighlight = (highlight, pdf) => {
    if (!onAttachHighlight) return;
    
    const attachedHighlight = {
      id: `pdf-${highlight.highlight_id}`,
      type: 'pdf',
      text: highlight.text,
      note: highlight.note,
      colorTag: highlight.color_tag,
      pageNumber: highlight.page_number,
      source: pdf.filename,
      timestamp: highlight.timestamp
    };
    
    onAttachHighlight(attachedHighlight);
  };

  // Start editing a PDF highlight note
  const handleStartEditNote = (highlight) => {
    setEditingNoteId(highlight.highlight_id);
    setEditingNoteText(highlight.note || '');
  };

  // Save PDF highlight note
  const handleSaveNote = async (pdfId, highlightId) => {
    try {
      // Update note via API - we need to add this endpoint
      await pdfAPI.updateHighlightNote(pdfId, highlightId, editingNoteText);
      
      // Update local state
      setPdfTabs(prev => prev.map(tab => {
        if (tab.id === activeTabId && tab.selectedPdfData) {
          const updatedHighlights = tab.selectedPdfData.highlights.map(h => 
            h.highlight_id === highlightId ? { ...h, note: editingNoteText } : h
          );
          return {
            ...tab,
            selectedPdfData: {
              ...tab.selectedPdfData,
              highlights: updatedHighlights
            }
          };
        }
        return tab;
      }));
      
      setEditingNoteId(null);
      setEditingNoteText('');
    } catch (err) {
      console.error('Failed to save note:', err);
      setError('Failed to save note');
    }
  };

  // Cancel editing note
  const handleCancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const handleUrlClick = (urlDoc) => {
    const selectedData = {
      projectId: selectedProjectId,
      urlDoc,
      highlights: urlDoc.highlights || []
    };
    
    // Always create a new highlights tab when clicking a URL card
    // (highlights tabs are now only created automatically, not manually accessible)
    const newTabId = `highlights-${Date.now()}`;
    const newTab = { id: newTabId, selectedUrlData: selectedData, createdAt: Date.now() };
    setHighlightsTabs(prev => [...prev, newTab]);
    setTabOrder(prev => [...prev, { id: newTabId, type: 'highlights' }]);
    setActiveTabId(newTabId);
    setActiveTabType('highlights');
    setPendingNewTabType(null); // Clear pending state
  };

  const handleBackToTable = () => {
    // Clear selectedUrlData for the active highlights tab
    setHighlightsTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, selectedUrlData: null } : tab
    ));
  };

  // Get active highlights tab data
  const getActiveHighlightsTab = () => {
    return highlightsTabs.find(tab => tab.id === activeTabId);
  };

  // Get selected URL data for the active highlights tab
  const getSelectedUrlData = () => {
    const activeTab = getActiveHighlightsTab();
    return activeTab?.selectedUrlData || null;
  };

  const formatShortDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateUrl = (url, maxLength = 60) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  const truncateText = (text, maxLength = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Format date for document highlights cards (e.g., "Nov 30th 2025 9:15pm")
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
    
    // Add ordinal suffix
    const getOrdinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    
    return `${month} ${getOrdinal(day)} ${year} ${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
  };

  // Helper to parse UTC date string - browser automatically converts to local timezone
  // Returns null if dateString is invalid or missing (never returns current time)
  const parseUTCDate = (dateString) => {
    if (!dateString) return null;
    let dateStr = String(dateString).trim();
    if (!dateStr || dateStr === 'undefined' || dateStr === 'null') return null;
    
    // Backend sends dates as ISO format without timezone (e.g., "2026-01-07T20:00:00.123456")
    // We MUST treat these as UTC, otherwise JavaScript will parse them as local time
    // Check if date string already has timezone info
    const hasTimezone = dateStr.endsWith('Z') || 
                       /[+-]\d{2}:\d{2}$/.test(dateStr) || 
                       /[+-]\d{4}$/.test(dateStr);
    
    // If it's an ISO format string (contains 'T') and doesn't have timezone, treat as UTC
    if (dateStr.includes('T') && !hasTimezone) {
      // Remove any trailing microseconds if present and add 'Z' to indicate UTC
      // Handle both formats: "2026-01-07T20:00:00" and "2026-01-07T20:00:00.123456"
      const withoutMs = dateStr.split('.')[0]; // Remove microseconds if present
      dateStr = withoutMs + 'Z';
    }
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn('Failed to parse date:', dateString);
      return null;
    }
    return date;
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

  // Format date for table - always show both date and time: "8:88 am, 7 Jan, 2026"
  const formatTableDate = (dateString) => {
    if (!dateString) return '—'; // Return placeholder if no valid date
    
    const date = parseUTCDate(dateString);
    if (!date) return '—'; // Return placeholder if parsing failed
    
    // Format time using browser's native time formatting
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    const timeStr = date.toLocaleTimeString('en-US', timeOptions).toLowerCase();
    
    // Format date: "7 Jan, 2026"
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate(); // Browser automatically converts to local timezone
    const month = months[date.getMonth()]; // Browser automatically converts to local timezone
    const year = date.getFullYear(); // Browser automatically converts to local timezone
    
    return `${timeStr}, ${day} ${month}, ${year}`;
  };
  // Handle table scroll for lazy loading
  const handleTableScroll = useCallback((e) => {
    const container = e.target;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // When scrolled to 80% of the way down, load more rows
    if (scrollTop + clientHeight >= scrollHeight * 0.8) {
      setVisibleRowsCount(prev => prev + 15);
    }
  }, []);

  // Reset visible rows count when search changes
  useEffect(() => {
    setVisibleRowsCount(15);
  }, [pdfSearchQuery]);

  // Group PDFs: sort by updated_at descending (newest first)
  const groupPdfsByTime = (pdfList) => {
    const sorted = [...pdfList];
    
    // Sort by updated_at descending (newest first)
    sorted.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at);
      const dateB = new Date(b.updated_at || b.created_at);
      return dateB - dateA;
    });
    
    return {
      nonArchived: sorted,
      archived: []
    };
  };

  // Extract domain name from URL
  const extractDomain = (url) => {
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname;
      // Remove www. prefix if present
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      // Capitalize first letter
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch {
      return 'Website';
    }
  };

  // Get favicon URL for a given URL
  const getFaviconUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=128`;
    } catch {
      return null;
    }
  };

  // Group URL highlights: sort by updated_at descending (newest first)
  const groupUrlsByTime = (urlList) => {
    const sorted = [...urlList];
    
    // Sort by updated_at descending (newest first)
    sorted.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at);
      const dateB = new Date(b.updated_at || b.created_at);
      return dateB - dateA;
    });
    
    return {
      nonArchived: sorted,
      archived: []
    };
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

  // Toggle URL time section expansion
  const toggleUrlTimeSection = (sectionKey) => {
    setExpandedUrlTimeSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Check if URL time section is expanded (default to expanded)
  const isUrlTimeSectionExpanded = (sectionKey) => {
    return expandedUrlTimeSections[sectionKey] !== false;
  };

  // One-time notice for removal of word counter feature
  useEffect(() => {
    console.log('[CACHE] Word counter removed - no longer fetching document content for word counts');
  }, []);

  // Group research documents: sort by updated_at descending (newest first)
  const groupDocsByTime = (docList) => {
    const sorted = [...docList];
    
    // Sort by updated_at descending (newest first)
    sorted.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at);
      const dateB = new Date(b.updated_at || b.created_at);
      return dateB - dateA;
    });
    
    return {
      nonArchived: sorted,
      archived: []
    };
  };

  // Word counter utilities removed

  const handleDeleteHighlight = async (sourceUrl, highlightId) => {
    if (!window.confirm('Are you sure you want to delete this highlight?')) {
      return;
    }
    
    try {
      await highlightsAPI.deleteHighlight(selectedProjectId, sourceUrl, highlightId);
      // Invalidate highlights cache
      try {
        console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
        const keys = [getCacheKey('highlights', selectedProjectId)];
        keys.forEach(k => localStorage.removeItem(k));
        console.log('[CACHE] Cleared cache keys:', keys);
      } catch (e) {
        console.warn('Failed to invalidate cache after URL highlight delete:', e);
      }
      if (selectedProjectId) {
        await loadHighlightsForProject(selectedProjectId);
      }
      
      // Update selected URL data in any highlights tabs that are viewing this URL
      setHighlightsTabs(prev => prev.map(tab => {
        if (tab.selectedUrlData && 
            tab.selectedUrlData.urlDoc.source_url === sourceUrl) {
          const updatedHighlights = tab.selectedUrlData.highlights.filter(h => h.highlight_id !== highlightId);
          return {
            ...tab,
            selectedUrlData: {
              ...tab.selectedUrlData,
              highlights: updatedHighlights,
              urlDoc: {
                ...tab.selectedUrlData.urlDoc,
                highlights: updatedHighlights
              }
            }
          };
        }
        return tab;
      }));
    } catch (err) {
      console.error('Failed to delete highlight:', err);
      setError('Failed to delete highlight. Please try again.');
    }
  };

  const handleDeleteSource = async (data, isPdf = false) => {
    if (!window.confirm('Are you sure you want to delete this source and all its highlights? This action cannot be undone.')) {
      return;
    }
    
    try {
      if (isPdf) {
        // For PDFs, use the PDF delete endpoint
        if (data.pdf_id) {
          await pdfAPI.deletePDF(data.pdf_id);
        }
        // Invalidate PDFs cache
        try {
          console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
          const keys = [getCacheKey('pdfs', selectedProjectId)];
          keys.forEach(k => localStorage.removeItem(k));
          console.log('[CACHE] Cleared cache keys:', keys);
        } catch (e) {
          console.warn('Failed to invalidate cache after PDF delete:', e);
        }
        if (selectedProjectId) {
          await loadPdfsForProject(selectedProjectId, true);
        }
        
        // Close any tabs viewing this PDF
        setPdfTabs(prev => prev.filter(tab => {
          if (tab.selectedPdfData && tab.selectedPdfData.pdf.pdf_id === data.pdf_id) {
            return false;
          }
          return true;
        }));
      } else {
        // For web sources, use the delete source endpoint
        const sourceUrl = data.source_url;
        await highlightsAPI.deleteSource(selectedProjectId, sourceUrl);
        // Invalidate highlights cache
        try {
          console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
          const keys = [getCacheKey('highlights', selectedProjectId)];
          keys.forEach(k => localStorage.removeItem(k));
          console.log('[CACHE] Cleared cache keys:', keys);
        } catch (e) {
          console.warn('Failed to invalidate cache after source delete:', e);
        }
        if (selectedProjectId) {
          await loadHighlightsForProject(selectedProjectId);
        }
        
        // Close any tabs viewing this URL
        setHighlightsTabs(prev => prev.filter(tab => {
          if (tab.selectedUrlData && tab.selectedUrlData.urlDoc.source_url === sourceUrl) {
            return false;
          }
          return true;
        }));
      }
      
      setOpenSourceMenuId(null);
    } catch (err) {
      console.error('Failed to delete source:', err);
      setError('Failed to delete source. Please try again.');
    }
  };

  // Notify parent of active document change
  useEffect(() => {
    if (onActiveDocumentChange) {
      onActiveDocumentChange(activeDocumentId);
    }
  }, [activeDocumentId, onActiveDocumentChange]);

  const fetchDocument = async (documentId) => {
    if (!documentId) {
      setContent('');
      setHtmlContent('');
      lastSavedContentRef.current = '';
      documentVersionRef.current = 0;
      return;
    }

    // Clear any pending auto-save timers
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxIntervalTimerRef.current) {
      clearTimeout(maxIntervalTimerRef.current);
      maxIntervalTimerRef.current = null;
    }

    setLoading(true);
    setError('');
    try {
      const response = await documentAPI.getDocument(documentId);
      const htmlContent = response.data.content || '';
      const version = response.data.version || 0;
      
      setContent(htmlContent);
      setHtmlContent(htmlContent);
      setSaveStatus('saved');
      lastSaveTimeRef.current = Date.now();
      pendingContentRef.current = null;
      
      // Initialize delta tracking
      lastSavedContentRef.current = htmlContent;
      documentVersionRef.current = version;
      
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load document';
      setError(errorMessage);
      console.error('Failed to fetch document:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch active document when it changes
  useEffect(() => {
    if (activeDocumentId) {
      fetchDocument(activeDocumentId);
    } else {
      setContent('');
      setHtmlContent('');
    }
  }, [activeDocumentId]);

  // Auto-refresh when refreshTrigger changes (new AI message)
  // But only if there are no unsaved changes
  useEffect(() => {
    if (refreshTrigger > 0 && activeDocumentId) {
      // Check if there are unsaved changes (using refs for current values)
      const hasUnsavedChanges = pendingContentRef.current !== null || 
                                (debounceTimerRef.current !== null);
      
      if (hasUnsavedChanges) {
        // Wait for auto-save to complete, then refresh
        // We'll wait for the debounce timer to complete plus a small buffer
        const waitForSave = async () => {
          // Wait for debounce delay plus a small buffer to ensure save completes
          await new Promise(resolve => setTimeout(resolve, DEBOUNCE_DELAY + 500));
          
          // Check if save completed (refs are always current)
          if (pendingContentRef.current === null && debounceTimerRef.current === null) {
            // Save completed, now refresh
            fetchDocument(activeDocumentId);
          } else {
            // Still has pending changes, wait a bit more
            setTimeout(() => {
              // Final check - if still pending, skip refresh to avoid data loss
              if (pendingContentRef.current === null && debounceTimerRef.current === null) {
                fetchDocument(activeDocumentId);
              }
              // If still pending, we skip the refresh to protect user's unsaved work
            }, 1000);
          }
        };
        
        waitForSave();
      } else {
        // No unsaved changes, safe to refresh immediately
        setTimeout(() => {
          fetchDocument(activeDocumentId);
        }, 1000);
      }
    }
  }, [refreshTrigger, activeDocumentId]);

  const handleRefresh = () => {
    if (activeDocumentId) {
      fetchDocument(activeDocumentId);
    }
  };


  // Auto-save constants (Phase 2: increased debounce)
  const DEBOUNCE_DELAY = 3000; // 3 seconds after user stops typing (Phase 2)
  const MAX_SAVE_INTERVAL = 30000; // Force save every 30 seconds
  const MIN_SAVE_INTERVAL = 10000; // Force save after 10 seconds if we skipped

  // Handle document name update
  const handleDocumentNameUpdate = async (newName) => {
    if (!activeDocumentId) return;
    
    try {
      await documentAPI.saveDocument(null, htmlContent, 'replace', activeDocumentId, null, newName);
      // Update local document state
      setDocuments(prev => prev.map(doc => 
        doc.document_id === activeDocumentId 
          ? { ...doc, title: newName || doc.title }
          : doc
      ));
      setIsEditingDocumentName(false);
      // Notify parent component that document name was updated
      if (onDocumentNameUpdate) {
        onDocumentNameUpdate();
      }
    } catch (err) {
      console.error('Failed to update document name:', err);
      setError('Failed to update document name');
    }
  };

  // Handle document name edit start
  const handleDocumentNameClick = () => {
    const activeDoc = getActiveDocument();
    if (activeDoc) {
      setEditingDocumentName(activeDoc.title || '');
      setIsEditingDocumentName(true);
    }
  };

  // Handle document name edit end
  const handleDocumentNameBlur = () => {
    if (editingDocumentName.trim()) {
      handleDocumentNameUpdate(editingDocumentName.trim());
    } else {
      setIsEditingDocumentName(false);
    }
  };

  // Handle document name key press
  const handleDocumentNameKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      setIsEditingDocumentName(false);
      setEditingDocumentName('');
    }
  };

  // Phase 3: Check if edit is on first page
  const isEditOnFirstPage = useCallback(() => {
    try {
      // Get TipTap editor instance
      if (!editorRef.current) {
        return true; // Default to true if editor not available
      }
      
      const editor = editorRef.current.getEditor();
      if (!editor) {
        return true; // Default to true if editor not available
      }

      // Get editor DOM element
      const editorDOM = editor.view.dom;
      if (!editorDOM) {
        return true; // Default to true if DOM not available
      }

      // Calculate scrollHeight of editor container
      const scrollHeight = editorDOM.scrollHeight;
      
      // Define page height: 1056px (11" at 96 DPI)
      const PAGE_HEIGHT = 1056;
      
      // Calculate total pages
      const totalPages = Math.ceil(scrollHeight / PAGE_HEIGHT);
      
      // If document is single page or less, always generate snapshot
      if (totalPages <= 1) {
        return true;
      }

      // Get cursor position
      const selection = editor.state.selection;
      if (!selection || !selection.$anchor) {
        return true; // Default to true if no selection
      }

      const cursorPos = selection.$anchor.pos;
      
      // Get coordinates of cursor position
      const coords = editor.view.coordsAtPos(cursorPos);
      if (!coords) {
        return true; // Default to true if coords not available
      }

      // Get editor container's bounding rect
      const editorRect = editorDOM.getBoundingClientRect();
      if (!editorRect) {
        return true; // Default to true if rect not available
      }

      // Calculate cursor Y relative to editor container
      const cursorY = coords.top - editorRect.top + editorDOM.scrollTop;
      
      // Determine which page the cursor is on (1-indexed)
      const currentPage = Math.floor(cursorY / PAGE_HEIGHT) + 1;
      
      // Return true if page === 1
      const isFirstPage = currentPage === 1;
      
      if (isFirstPage) {
        console.log(`[DELTA] Edit on page 1, snapshot will be generated`);
      } else {
        console.log(`[DELTA] Edit on page ${currentPage}, skipping snapshot`);
      }
      
      return isFirstPage;
    } catch (error) {
      console.error('[DELTA] Error checking edit page:', error);
      return true; // Default to true on error to be safe
    }
  }, []);

  // Perform the actual save operation using delta patches
  const performSave = useCallback(async (htmlContentToSave, forceSave = false) => {
    if (!activeDocumentId || htmlContentToSave === undefined || htmlContentToSave === null) {
      return;
    }

    // Compute diff between last saved content and new content
    const dmp = dmpRef.current;
    const patches = dmp.patch_make(lastSavedContentRef.current, htmlContentToSave);
    
    // If no changes, skip save (unless forced)
    if (patches.length === 0 && !forceSave) {
      pendingContentRef.current = null;
      return;
    }
    
    const patchText = dmp.patch_toText(patches);
    const fullContentLength = htmlContentToSave.length;
    const patchLength = patchText.length;

    // Check if enough time has passed since last skip to force save
    // Only apply this timer if we previously skipped a save
    // If forceSave is true (from skip timer), always force the save
    const wasTimerRunning = lastSkipTimeRef.current !== null;
    const timeSinceLastSkip = wasTimerRunning ? (Date.now() - lastSkipTimeRef.current) : null;
    const shouldForceSave = forceSave || (wasTimerRunning && timeSinceLastSkip >= MIN_SAVE_INTERVAL);

    // Phase 2: Skip if content hasn't changed (unless forced)
    if (htmlContentToSave === lastSavedContentRef.current && !forceSave) {
      lastSaveTimeRef.current = Date.now(); // Update to prevent MAX_SAVE_INTERVAL from triggering
      pendingContentRef.current = null;
      return;
    }

    // Phase 2: Queue save if another save is in progress
    if (saveInProgressRef.current) {
      pendingSaveQueueRef.current = htmlContentToSave;
      return;
    }

    // Phase 1: Skip saves for tiny patches (unless enough time has passed since last skip)
    if (patchLength < 200 && !shouldForceSave) {
      const timerJustStarted = lastSkipTimeRef.current === null;
      lastSkipTimeRef.current = Date.now(); // Track when we skipped
      lastSaveTimeRef.current = Date.now(); // Update last save time to prevent MAX_SAVE_INTERVAL from triggering
      if (timerJustStarted) {
        // Store the content to save when timer fires
        skippedContentRef.current = htmlContentToSave;
        // Set actual timer to fire after 10 seconds
        if (skipTimerRef.current) {
          clearTimeout(skipTimerRef.current);
        }
        skipTimerRef.current = setTimeout(() => {
          if (skippedContentRef.current) {
            const contentToSave = skippedContentRef.current;
            skippedContentRef.current = null; // Clear it before saving
            performSave(contentToSave, true); // Force save when timer fires
          }
        }, MIN_SAVE_INTERVAL);
      } else {
        // Timer already running, update the content to save
        skippedContentRef.current = htmlContentToSave;
      }
      pendingContentRef.current = null;
      return;
    }

    // Skip save if patch is inefficient (>80% of new content size)
    // But still save if enough time has passed since last skip
    if (fullContentLength > 0 && patchLength > fullContentLength * 0.8 && !shouldForceSave) {
      const timerJustStarted = lastSkipTimeRef.current === null;
      lastSkipTimeRef.current = Date.now(); // Track when we skipped
      lastSaveTimeRef.current = Date.now(); // Update last save time to prevent MAX_SAVE_INTERVAL from triggering
      if (timerJustStarted) {
        // Store the content to save when timer fires
        skippedContentRef.current = htmlContentToSave;
        // Set actual timer to fire after 10 seconds
        if (skipTimerRef.current) {
          clearTimeout(skipTimerRef.current);
        }
        skipTimerRef.current = setTimeout(() => {
          if (skippedContentRef.current) {
            const contentToSave = skippedContentRef.current;
            skippedContentRef.current = null; // Clear it before saving
            performSave(contentToSave, true); // Force save when timer fires
          }
        }, MIN_SAVE_INTERVAL);
      } else {
        // Timer already running, update the content to save
        skippedContentRef.current = htmlContentToSave;
      }
      pendingContentRef.current = null;
      return;
    }

    // Clear the skip timer since we're forcing the save
    if (shouldForceSave && skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }

    // Phase 3: Check if edit is on first page
    const shouldGenerateSnapshot = isEditOnFirstPage();

    // Phase 2: Mark save as in progress
    saveInProgressRef.current = true;
    setSaveStatus('saving');
    try {
      const response = await documentAPI.saveDocument(
        activeDocumentId, 
        patchText, 
        documentVersionRef.current,
        null, // title
        shouldGenerateSnapshot
      );
      
      // Update tracking refs with successful save
      const newVersion = response.data.version;
      const hadTimer = lastSkipTimeRef.current !== null;
      lastSavedContentRef.current = htmlContentToSave;
      documentVersionRef.current = newVersion;
      lastSkipTimeRef.current = null; // Clear skip timer on successful save
      skippedContentRef.current = null; // Clear skipped content
      if (skipTimerRef.current) {
        clearTimeout(skipTimerRef.current);
        skipTimerRef.current = null;
      }
      
      console.log('Save successful');
      
      setContent(htmlContentToSave);
      setSaveStatus('saved');
      lastSaveTimeRef.current = Date.now();
      pendingContentRef.current = null;
      
      // Phase 2: Process queued save if there is one
      saveInProgressRef.current = false;
      if (pendingSaveQueueRef.current) {
        const queuedContent = pendingSaveQueueRef.current;
        pendingSaveQueueRef.current = null;
        performSave(queuedContent);
      }
      
      // Word count tracking removed
    } catch (err) {
      // Handle version conflict - refetch and retry
      if (err.response?.status === 409) {
        try {
          const freshDoc = await documentAPI.getDocument(activeDocumentId);
          lastSavedContentRef.current = freshDoc.data.content || '';
          documentVersionRef.current = freshDoc.data.version || 0;
          
          // Re-compute patches with fresh content
          const newPatches = dmp.patch_make(lastSavedContentRef.current, htmlContentToSave);
          if (newPatches.length > 0) {
            const newPatchText = dmp.patch_toText(newPatches);
            // Phase 3: Check if edit is on first page for retry
            const shouldGenerateSnapshotRetry = isEditOnFirstPage();
            const retryResponse = await documentAPI.saveDocument(
              activeDocumentId,
              newPatchText,
              documentVersionRef.current,
              null, // title
              shouldGenerateSnapshotRetry
            );
            lastSavedContentRef.current = htmlContentToSave;
            documentVersionRef.current = retryResponse.data.version;
            const hadTimer = lastSkipTimeRef.current !== null;
            lastSkipTimeRef.current = null; // Clear skip timer on successful retry
            skippedContentRef.current = null; // Clear skipped content
            if (skipTimerRef.current) {
              clearTimeout(skipTimerRef.current);
              skipTimerRef.current = null;
            }
            console.log('Save successful');
            setSaveStatus('saved');
            lastSaveTimeRef.current = Date.now();
            pendingContentRef.current = null;
            
            // Phase 2: Process queued save if there is one
            saveInProgressRef.current = false;
            if (pendingSaveQueueRef.current) {
              const queuedContent = pendingSaveQueueRef.current;
              pendingSaveQueueRef.current = null;
              performSave(queuedContent);
            }
            return;
          }
        } catch (retryErr) {
          // Retry failed, log the retry error
          const retryErrorMessage = retryErr.response?.data?.error || retryErr.message || 'Retry failed';
          console.error(`Save not successful: Retry failed - ${retryErrorMessage}`);
          setSaveStatus('error');
          saveInProgressRef.current = false;
          
          // Process queued save if there is one
          if (pendingSaveQueueRef.current) {
            const queuedContent = pendingSaveQueueRef.current;
            pendingSaveQueueRef.current = null;
            performSave(queuedContent);
          }
          return;
        }
      }
      
      // Phase 2: Clear save in progress flag on error
      saveInProgressRef.current = false;
      setSaveStatus('error');
      const errorMessage = err.response?.data?.error || err.message || 'Unknown error';
      console.error(`Save not successful: ${errorMessage}`);
      
      // Phase 2: Process queued save if there is one (even after error)
      if (pendingSaveQueueRef.current) {
        const queuedContent = pendingSaveQueueRef.current;
        pendingSaveQueueRef.current = null;
        performSave(queuedContent);
      }
    }
  }, [activeDocumentId, isEditOnFirstPage]);

  // Schedule auto-save with debounce
  const scheduleAutoSave = useCallback((newHtmlContent) => {
    // Store pending content
    pendingContentRef.current = newHtmlContent;

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (save after 3s of inactivity - Phase 2)
    debounceTimerRef.current = setTimeout(() => {
      if (pendingContentRef.current) {
        performSave(pendingContentRef.current);
      }
    }, DEBOUNCE_DELAY);

    // Phase 2: Check MAX_SAVE_INTERVAL only if no save is in progress
    // Don't trigger if skip timer is running (let skip timer handle it)
    // This prevents triggering saves while another save is happening or while we're skipping
    if (!saveInProgressRef.current && lastSkipTimeRef.current === null) {
      const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
      if (timeSinceLastSave >= MAX_SAVE_INTERVAL) {
        // Clear debounce and save immediately (but only if not in progress and not skipping)
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        performSave(newHtmlContent);
      } else if (!maxIntervalTimerRef.current) {
        // Set max interval timer if not already set
        const remainingTime = MAX_SAVE_INTERVAL - timeSinceLastSave;
        maxIntervalTimerRef.current = setTimeout(() => {
          if (pendingContentRef.current && !saveInProgressRef.current && lastSkipTimeRef.current === null) {
            // Clear debounce timer
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            performSave(pendingContentRef.current);
          }
          maxIntervalTimerRef.current = null;
        }, remainingTime);
      }
    }
  }, [performSave]);

  // Handle content change from Quill editor
  const handleEditorChange = useCallback((newHtmlContent) => {
    setHtmlContent(newHtmlContent);
    scheduleAutoSave(newHtmlContent);
  }, [scheduleAutoSave]);

  // Undo handler
  const handleUndo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.undo();
    }
  }, []);

  // Redo handler
  const handleRedo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.redo();
    }
  }, []);

  // Insert content at the saved cursor position (or end of document if no saved position)
  // This enables Google Docs-like behavior where the cursor position is remembered
  // even when user clicks in a different panel (like the chat window)
  const insertContentAtCursor = useCallback((htmlContent) => {
    if (editorRef.current && editorRef.current.insertAtCursor) {
      const success = editorRef.current.insertAtCursor(htmlContent);
      if (success) {
        // Trigger auto-save after insertion
        const newHtml = editorRef.current.getHTML?.() || '';
        if (newHtml) {
          scheduleAutoSave(newHtml);
        }
      }
      return success;
    }
    return false;
  }, [scheduleAutoSave]);

  // Check if there's a saved cursor position
  const hasSavedCursorPosition = useCallback(() => {
    return editorRef.current?.hasSavedCursorPosition?.() || false;
  }, []);

  // Expose editor methods to parent component via callback
  // This allows ChatWindow to insert content at the cursor position
  useEffect(() => {
    if (onEditorReady) {
      onEditorReady({
        insertContentAtCursor,
        hasSavedCursorPosition,
        getActiveDocumentId: () => activeDocumentId,
      });
    }
  }, [onEditorReady, insertContentAtCursor, hasSavedCursorPosition, activeDocumentId]);

  // Save on page unload/blur
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingContentRef.current && activeDocumentId) {
        // Compute delta for beacon save
        const dmp = dmpRef.current;
        const patches = dmp.patch_make(lastSavedContentRef.current, pendingContentRef.current);
        
        if (patches.length > 0) {
          const patchText = dmp.patch_toText(patches);
          navigator.sendBeacon(
            `/api/document`,
            JSON.stringify({
              document_id: activeDocumentId,
              patches: patchText,
              version: documentVersionRef.current
            })
          );
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingContentRef.current) {
        performSave(pendingContentRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Clean up timers on unmount
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (maxIntervalTimerRef.current) {
        clearTimeout(maxIntervalTimerRef.current);
      }
    };
  }, [activeDocumentId, performSave]);

  const handleAddDocument = () => {
    // If we're on a different tab type (highlights or PDF), switch to document tab first
    if (activeTabType !== 'document') {
      setActiveTabType('document');
      // If there's an active document, use it as the active tab
      if (activeDocumentId) {
        setActiveTabId(activeDocumentId);
      }
      // Always show the document list when switching from another tab type
      setShowDocumentList(true);
      if (selectedProjectId) {
        loadAvailableDocuments(selectedProjectId);
        loadHighlightsForProject(selectedProjectId);
        loadPdfsForProject(selectedProjectId);
      }
    } else {
      // If already on document tab, toggle the document list
      setShowDocumentList(!showDocumentList);
      if (!showDocumentList && selectedProjectId) {
        loadAvailableDocuments(selectedProjectId);
        loadHighlightsForProject(selectedProjectId);
        loadPdfsForProject(selectedProjectId);
      }
    }
  };

  const handleCreateNewDocument = async () => {
    if (!selectedProjectId) {
      setError('Please wait for project to load...');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const title = newDocumentTitle.trim() || undefined;
      const response = await documentAPI.createResearchDocument(selectedProjectId, title);
      const newDocId = response.data.document_id;
      
      // Add to documents list
      const newDoc = {
        document_id: newDocId,
        title: title || `Research Document ${new Date().toLocaleString()}`,
        project_id: selectedProjectId
      };
      
      setDocuments([...documents, newDoc]);
      setTabOrder(prev => [...prev, { id: newDocId, type: 'document' }]);
      setActiveDocumentId(newDocId);
      setActiveTabId(newDocId);
      setActiveTabType('document');
      setShowDocumentList(false);
      setNewDocumentTitle('');
      setPendingNewTabType(null); // Clear any pending state
      
      // Invalidate documents cache
      try {
        console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
        const keys = [getCacheKey('documents', selectedProjectId)];
        keys.forEach(k => localStorage.removeItem(k));
        console.log('[CACHE] Cleared cache keys:', keys);
      } catch (e) {
        console.warn('Failed to invalidate cache after document create:', e);
      }
      
      // Reload available documents
      await loadAvailableDocuments(selectedProjectId);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create document';
      setError(errorMessage);
      console.error('Failed to create document:', err);
      console.error('Error details:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExistingDocument = (documentId) => {
    // Check if document is already open
    const existingDoc = documents.find(doc => doc.document_id === documentId);
    if (existingDoc) {
      setActiveDocumentId(documentId);
      setActiveTabId(documentId);
      setActiveTabType('document');
    } else {
      // Add to open documents
      const doc = availableDocuments.find(d => d.document_id === documentId);
      if (doc) {
        setDocuments([...documents, doc]);
        setTabOrder(prev => [...prev, { id: documentId, type: 'document' }]);
        setActiveDocumentId(documentId);
        setActiveTabId(documentId);
        setActiveTabType('document');
      }
    }
    setShowDocumentList(false);
    setPendingNewTabType(null); // Clear any pending state
    setError('');
  };

  // Helper to switch to another tab after closing one
  const switchToNextTab = (closedTabId) => {
    // Find the closed tab's position in tabOrder
    const closedIndex = tabOrder.findIndex(t => t.id === closedTabId);
    const remainingTabs = tabOrder.filter(t => t.id !== closedTabId);
    
    if (remainingTabs.length === 0) {
      // No tabs left
      setActiveTabId(null);
      setActiveDocumentId(null);
      setActiveTabType('document');
      setShowDocumentList(true);
      return;
    }
    
    // Try to switch to the next tab (or previous if closing the last one)
    const nextIndex = Math.min(closedIndex, remainingTabs.length - 1);
    const nextTab = remainingTabs[nextIndex];
    
    setActiveTabId(nextTab.id);
    setActiveTabType(nextTab.type);
    if (nextTab.type === 'document') {
      setActiveDocumentId(nextTab.id);
    }
  };

  const handleCloseTab = (documentId, e) => {
    e.stopPropagation();
    const newDocuments = documents.filter(doc => doc.document_id !== documentId);
    setDocuments(newDocuments);
    setTabOrder(prev => prev.filter(t => t.id !== documentId));
    
    // If closing active tab, switch to another
    if (documentId === activeDocumentId || documentId === activeTabId) {
      switchToNextTab(documentId);
    }
  };

  const handleCloseHighlightsTab = (tabId, e) => {
    e.stopPropagation();
    const newHighlightsTabs = highlightsTabs.filter(tab => tab.id !== tabId);
    setHighlightsTabs(newHighlightsTabs);
    setTabOrder(prev => prev.filter(t => t.id !== tabId));
    
    // If closing active tab, switch to another
    if (tabId === activeTabId) {
      switchToNextTab(tabId);
    }
  };

  const handleClosePdfTab = (tabId, e) => {
    e.stopPropagation();
    const newPdfTabs = pdfTabs.filter(tab => tab.id !== tabId);
    setPdfTabs(newPdfTabs);
    setTabOrder(prev => prev.filter(t => t.id !== tabId));
    
    // If closing active tab, switch to another
    if (tabId === activeTabId) {
      switchToNextTab(tabId);
    }
  };

  const handleCloseResearchDocsTab = (tabId, e) => {
    e.stopPropagation();
    const newResearchDocsTabs = researchDocsTabs.filter(tab => tab.id !== tabId);
    setResearchDocsTabs(newResearchDocsTabs);
    setTabOrder(prev => prev.filter(t => t.id !== tabId));
    
    // If closing active tab, switch to another
    if (tabId === activeTabId) {
      switchToNextTab(tabId);
    }
  };

  const handleHighlightsTabClick = (tabId) => {
    setActiveTabId(tabId);
    setActiveTabType('highlights');
    setPendingNewTabType(null); // Clear pending state when clicking existing tab
    if (highlightsUrls.length === 0 && selectedProjectId) {
      loadHighlightsForProject(selectedProjectId);
    }
  };

  const handlePdfTabClick = (tabId) => {
    setActiveTabId(tabId);
    setActiveTabType('pdf');
    setPendingNewTabType(null); // Clear pending state when clicking existing tab
    if (pdfs.length === 0 && selectedProjectId) {
      loadPdfsForProject(selectedProjectId);
    }
  };

  const handleResearchDocsTabClick = (tabId) => {
    setActiveTabId(tabId);
    setActiveTabType('researchdocs');
    setPendingNewTabType(null); // Clear pending state when clicking existing tab
    if (availableDocuments.length === 0 && selectedProjectId) {
      loadAvailableDocuments(selectedProjectId);
    }
  };

  const handleDocumentTabClick = (documentId) => {
    setActiveTabId(documentId);
    setActiveTabType('document');
    setActiveDocumentId(documentId);
    setPendingNewTabType(null); // Clear pending state when clicking existing tab
    setShowDocumentList(false); // Hide document list when clicking on a document tab
  };

  // Unified tab click handler for LeftSidebar
  const handleTabClick = (tabEntry) => {
    if (tabEntry.type === 'document') {
      handleDocumentTabClick(tabEntry.id);
    } else if (tabEntry.type === 'highlights') {
      handleHighlightsTabClick(tabEntry.id);
    } else if (tabEntry.type === 'pdf') {
      handlePdfTabClick(tabEntry.id);
    } else if (tabEntry.type === 'researchdocs') {
      handleResearchDocsTabClick(tabEntry.id);
    }
  };

  // Unified tab close handler for LeftSidebar
  const handleTabClose = (tabEntry) => {
    if (tabEntry.type === 'document') {
      handleCloseTab(tabEntry.id, { stopPropagation: () => {} });
    } else if (tabEntry.type === 'highlights') {
      handleCloseHighlightsTab(tabEntry.id, { stopPropagation: () => {} });
    } else if (tabEntry.type === 'pdf') {
      handleClosePdfTab(tabEntry.id, { stopPropagation: () => {} });
    } else if (tabEntry.type === 'researchdocs') {
      handleCloseResearchDocsTab(tabEntry.id, { stopPropagation: () => {} });
    }
  };

  // Expose tab data to parent component
  useEffect(() => {
    if (onTabDataChange) {
      onTabDataChange({
        tabOrder,
        documents,
        highlightsTabs,
        pdfTabs,
        researchDocsTabs,
        activeTabType,
        activeTabId,
        activeDocumentId,
        onTabClick: handleTabClick,
        onCloseTab: handleTabClose,
        onAddDocument: handleAddDocument,
        getFaviconUrl: (url) => {
          try {
            const urlObj = new URL(url);
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=128`;
          } catch {
            return null;
          }
        }
      });
    }
  }, [tabOrder, documents, highlightsTabs, pdfTabs, researchDocsTabs, activeTabType, activeTabId, activeDocumentId, onTabDataChange]);

  const getActiveDocument = () => {
    return documents.find(doc => doc.document_id === activeDocumentId);
  };

  const toggleDocMenu = () => {
    setIsDocMenuOpen(prev => !prev);
  };

  const handleVersionHistory = () => {
    // Placeholder for a future version history feature
    setIsDocMenuOpen(false);
  };

  const handleDownloadDocument = async () => {
    setIsDocMenuOpen(false);

    if (!activeDocumentId) {
      setError('No document selected');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Download PDF from backend
      const response = await documentAPI.downloadResearchDocumentPDF(activeDocumentId);
      
      // Create blob from response
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      // Get document title for filename
      const activeDoc = getActiveDocument();
      const safeTitle = (activeDoc?.title || 'document').replace(/[^a-z0-9_\-]+/gi, '_');
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeTitle || 'document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download document:', err);
      setError(err.response?.data?.error || 'Failed to download document');
    } finally {
      setLoading(false);
    }
  };

  // Handle selecting a research doc from the list - opens it as a regular editable document tab
  const handleResearchDocClick = (doc) => {
    // Clear pending state if we were in research docs pending view
    if (pendingNewTabType === 'researchdocs') {
      setPendingNewTabType(null);
    }
    
    // Check if document is already open
    const existingDoc = documents.find(d => d.document_id === doc.document_id);
    if (existingDoc) {
      // Switch to existing tab
      setActiveDocumentId(doc.document_id);
      setActiveTabId(doc.document_id);
      setActiveTabType('document');
    } else {
      // Add to open documents and switch to it
      setDocuments([...documents, doc]);
      setTabOrder(prev => [...prev, { id: doc.document_id, type: 'document' }]);
      setActiveDocumentId(doc.document_id);
      setActiveTabId(doc.document_id);
      setActiveTabType('document');
    }
    // Hide the document list to show the actual document content
    setShowDocumentList(false);
    setError('');
  };


  return (
    <div className="document-panel">
      <div className="document-content">
        {error && <div className="error-message">{error}</div>}
        
        {/* Highlights Tab Content */}
        {activeTabType === 'highlights' && (
          <div className="highlights-content">
            {getSelectedUrlData() ? (
                /* Split View: Web View (70%) + Highlights List (30%) */
                <div className="highlights-split-view">
                  <div className="highlights-web-view-section">
                    {/* Browser Toolbar */}
                    <div className="browser-toolbar">
                      <div className="browser-nav-buttons">
                        <button 
                          className="browser-nav-btn"
                          onClick={() => {
                            const iframe = document.querySelector('.highlights-iframe');
                            if (iframe && iframe.contentWindow) {
                              try { iframe.contentWindow.history.back(); } catch(e) {}
                            }
                          }}
                          title="Go back"
                        >
                          <ArrowLeftIcon />
                        </button>
                        <button 
                          className="browser-nav-btn"
                          onClick={() => {
                            const iframe = document.querySelector('.highlights-iframe');
                            if (iframe && iframe.contentWindow) {
                              try { iframe.contentWindow.history.forward(); } catch(e) {}
                            }
                          }}
                          title="Go forward"
                        >
                          <ArrowRightIcon />
                        </button>
                      </div>
                      <div className="browser-url-bar">
                        <span className="browser-url-text">{getSelectedUrlData().urlDoc.source_url}</span>
                      </div>
                    </div>
                    {/* Iframe Content */}
                    <iframe
                      src={getSelectedUrlData().urlDoc.source_url}
                      className="highlights-iframe"
                      title="Web view"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>
                  <div className="highlights-list-section">
                    <div className="highlights-list-content">
                      {getSelectedUrlData().highlights.length === 0 ? (
                        <div className="no-highlights-message-list">
                          <p>No highlights saved for this URL yet.</p>
                        </div>
                      ) : (
                        getSelectedUrlData().highlights.map((highlight, hIndex) => (
                          <div key={hIndex} className="url-highlight-card-item">
                            <div className="url-highlight-card-content">
                              <div className="url-highlight-text-box">
                                <p className="url-highlight-text">{highlight.text}</p>
                              </div>
                              <div className="url-highlight-timestamp">
                                <span>Saved <strong>{formatHighlightDate(highlight.timestamp)}</strong></span>
                              </div>
                            </div>
                            {highlight.note && (
                              <div className="url-highlight-notes-section">
                                <div className="url-highlight-notes-label">Notes</div>
                                <p className="url-highlight-notes-text">{highlight.note}</p>
                              </div>
                            )}
                            <div className="url-highlight-actions-row">
                              {!highlight.note && (
                                <button 
                                  className="url-highlight-add-note-btn"
                                  onClick={() => {/* TODO: Add note functionality for URL highlights */}}
                                  title="Add note"
                                >
                                  <span>+ Add Note</span>
                                </button>
                              )}
                              <button 
                                className="url-highlight-attach-btn"
                                onClick={() => handleAttachWebHighlight(highlight, getSelectedUrlData().urlDoc)}
                                title="Attach to chat"
                              >
                                <AttachIcon />
                                <span>Attach</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
              /* URL Highlights Grid View - Figma Design */
              highlightsLoading ? (
                <div className="loading-message">Loading highlights...</div>
              ) : !selectedProjectId ? (
                <div className="empty-state">
                  <p>No project selected.</p>
                </div>
              ) : highlightsUrls.length === 0 ? (
                <div className="url-highlights-empty">
                  <GlobeIconLarge />
                  <p>No highlights saved for this project yet.</p>
                  <p className="empty-hint">Use the browser extension to highlight text on web pages.</p>
                </div>
              ) : (
                <div className="url-highlights-view">
                  {/* Header with Title, Search Bar and Create New Button */}
                  <SectionHeader
                    title="Web Highlights"
                    searchQuery={urlSearchQuery}
                    onSearchChange={setUrlSearchQuery}
                    searchPlaceholder="Search for highlights...."
                    ctaType="disabled"
                    ctaText="Create New"
                  />
                  
                  <div className="url-highlights-sections">
                    {/* Group URLs by time */}
                    {(() => {
                      const grouped = groupUrlsByTime(highlightsUrls);
                      
                      // Filter URLs by search query (search in highlights, page title, domain, and URL)
                      const filterUrls = (urls) => {
                        if (!urlSearchQuery.trim()) return urls;
                        const query = urlSearchQuery.toLowerCase();
                        return urls.filter(urlDoc => {
                          // Search in page title
                          if ((urlDoc.page_title || '').toLowerCase().includes(query)) return true;
                          // Search in domain
                          if (extractDomain(urlDoc.source_url).toLowerCase().includes(query)) return true;
                          // Search in URL
                          if ((urlDoc.source_url || '').toLowerCase().includes(query)) return true;
                          // Search in highlight text
                          if (urlDoc.highlights && Array.isArray(urlDoc.highlights)) {
                            return urlDoc.highlights.some(highlight => 
                              (highlight.text || '').toLowerCase().includes(query) ||
                              (highlight.note || '').toLowerCase().includes(query)
                            );
                          }
                          return false;
                        });
                      };

                      // Filter grouped URLs
                      const filteredGrouped = {
                        nonArchived: filterUrls(grouped.nonArchived),
                        archived: []
                      };
                      
                      // Helper function to render a URL card
                      const renderUrlCard = (urlDoc, key) => (
                        <div 
                          key={key}
                          className="url-highlight-card"
                          onClick={() => handleUrlClick(urlDoc)}
                        >
                          <div className="url-card-thumbnail">
                            <div className="url-card-favicon">
                              {getFaviconUrl(urlDoc.source_url) ? (
                                <img 
                                  src={getFaviconUrl(urlDoc.source_url)} 
                                  alt={extractDomain(urlDoc.source_url)}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <div className="url-card-favicon-placeholder">
                                  <GlobeIconCard />
                                </div>
                              )}
                            </div>
                            <div className="url-card-site-info">
                              <p className="url-card-domain">{extractDomain(urlDoc.source_url)}</p>
                              <p className="url-card-page-title">{urlDoc.page_title || 'Untitled Page'}</p>
                            </div>
                          </div>
                          <div className="url-card-content">
                            <div className="url-card-highlights-count">
                              {urlDoc.highlights?.length || 0} highlight{(urlDoc.highlights?.length || 0) !== 1 ? 's' : ''}
                            </div>
                            <div className="url-card-date">
                              <span>{formatLastUpdatedTime(urlDoc.updated_at)}</span>
                            </div>
                          </div>
                          <CardMenu
                            itemId={urlDoc.source_url}
                            isArchived={urlDoc.archived || false}
                            onRename={async () => {
                              // URL cards don't support rename yet
                              console.log('Rename not supported for URL cards');
                            }}
                            onArchive={async () => {
                              try {
                                // Archive URL highlight - using same pattern as documents
                                // Note: Backend endpoint needs to be implemented
                                const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/highlights/archive`, {
                                  method: 'PUT',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${getToken()}`
                                  },
                                  body: JSON.stringify({
                                    project_id: selectedProjectId,
                                    source_url: urlDoc.source_url
                                  })
                                });
                                if (!response.ok) throw new Error('Archive failed');
                                // Invalidate highlights cache
                                try {
                                  console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
                                  const keys = [getCacheKey('highlights', selectedProjectId)];
                                  keys.forEach(k => localStorage.removeItem(k));
                                  console.log('[CACHE] Cleared cache keys:', keys);
                                } catch (e) {
                                  console.warn('Failed to invalidate cache after highlight archive:', e);
                                }
                                if (selectedProjectId) {
                                  loadHighlightsForProject(selectedProjectId);
                                }
                              } catch (error) {
                                console.error('Failed to archive highlight:', error);
                                alert('Failed to archive highlight. Please try again.');
                              }
                            }}
                            onUnarchive={async () => {
                              try {
                                // Unarchive URL highlight - using same pattern as documents
                                // Note: Backend endpoint needs to be implemented
                                const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/highlights/unarchive`, {
                                  method: 'PUT',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${getToken()}`
                                  },
                                  body: JSON.stringify({
                                    project_id: selectedProjectId,
                                    source_url: urlDoc.source_url
                                  })
                                });
                                if (!response.ok) throw new Error('Unarchive failed');
                                // Invalidate highlights cache
                                try {
                                  console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
                                  const keys = [getCacheKey('highlights', selectedProjectId)];
                                  keys.forEach(k => localStorage.removeItem(k));
                                  console.log('[CACHE] Cleared cache keys:', keys);
                                } catch (e) {
                                  console.warn('Failed to invalidate cache after highlight unarchive:', e);
                                }
                                if (selectedProjectId) {
                                  loadHighlightsForProject(selectedProjectId);
                                }
                              } catch (error) {
                                console.error('Failed to unarchive highlight:', error);
                                alert('Failed to unarchive highlight. Please try again.');
                              }
                            }}
                            position={{ top: '7px', right: '6.56px' }}
                          />
                        </div>
                      );
                      
                      // Helper function to render a collapsible section
                      const renderSection = (label, items, sectionKey, isArchived = false) => {
                        if (items.length === 0) return null;
                        const isExpanded = isUrlTimeSectionExpanded(sectionKey);
                        
                        return (
                          <div className={`highlights-time-section ${isArchived ? 'archived' : ''}`}>
                            <div 
                              className="highlights-time-section-header"
                              onClick={() => toggleUrlTimeSection(sectionKey)}
                            >
                              <div className={`highlights-time-section-caret ${!isExpanded ? 'collapsed' : ''}`}>
                                <ChevronMdSvg className="highlights-time-section-caret-icon" />
                              </div>
                              <p className="highlights-section-label">{label}</p>
                            </div>
                            {isExpanded && (
                              <div className="highlights-cards-grid">
                                {items.map((urlDoc, idx) => renderUrlCard(urlDoc, `${sectionKey}-${idx}`))}
                              </div>
                            )}
                          </div>
                        );
                      };
                      
                      return (
                        <>
                          {/* URLs (sorted by date, newest first) */}
                          {filteredGrouped.nonArchived.length > 0 && (
                            <div className="highlights-time-section">
                              <div className="highlights-cards-grid">
                                {filteredGrouped.nonArchived.map((urlDoc, idx) => renderUrlCard(urlDoc, `nonArchived-${idx}`))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* PDF Tab Content - Document Highlights Grid View */}
        {activeTabType === 'pdf' && (
          <div className="pdf-content">
            {getSelectedPdfData() ? (
              /* Split View: PDF Viewer (70%) + Highlights List (30%) */
              <div className="pdf-split-view">
                <div className="pdf-viewer-section">
                  {/* PDF Toolbar */}
                  <div className="doc-viewer-toolbar">
                    <div className="doc-viewer-filename">
                      <span>{getSelectedPdfData().pdf.filename}</span>
                    </div>
                  </div>
                  {/* PDF Iframe Content */}
                  <iframe
                    src={pdfAPI.getPDFFileUrl(getSelectedPdfData().pdf.pdf_id)}
                    className="pdf-iframe"
                    title="PDF viewer"
                  />
                </div>
                <div className="pdf-highlights-section">
                  {getSelectedPdfData().extractionError && (
                    <div className="extraction-error">
                      Error: {getSelectedPdfData().extractionError}
                      {getSelectedPdfData().extractionStatus === 'failed' && (
                        <button
                          className="reextract-button-inline"
                          onClick={() => handleReextractHighlights(getSelectedPdfData().pdf.pdf_id)}
                          title="Re-extract highlights"
                        >
                          Re-extract
                        </button>
                      )}
                    </div>
                  )}
                  <div className="pdf-highlights-list">
                    {getSelectedPdfData().highlights.length === 0 ? (
                      <div className="no-highlights-message-pdf">
                        {getSelectedPdfData().extractionStatus === 'processing' ? (
                          <p>AI is extracting highlights from this PDF. Please refresh in a moment.</p>
                        ) : getSelectedPdfData().extractionStatus === 'failed' ? (
                          <p>Failed to extract highlights. Click "Re-extract" to try again.</p>
                        ) : (
                          <p>No highlights found in this PDF.</p>
                        )}
                      </div>
                    ) : (
                      getSelectedPdfData().highlights.map((highlight, hIndex) => (
                        <div key={hIndex} className="doc-highlight-card-item">
                          <div className="doc-highlight-card-content">
                            <div className={`doc-highlight-text-box ${getColorClass(highlight.color_tag)}`}>
                              <p className="doc-highlight-text">{highlight.text}</p>
                            </div>
                            <div className="doc-highlight-timestamp">
                              <span>Saved <strong>{formatHighlightDate(highlight.timestamp || new Date().toISOString())}</strong></span>
                            </div>
                          </div>
                          {editingNoteId === highlight.highlight_id ? (
                            <div className="doc-highlight-notes-section">
                              <div className="doc-highlight-notes-label">Notes</div>
                              <textarea
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                placeholder="Add a note..."
                                className="doc-note-edit-textarea"
                              />
                              <div className="doc-note-edit-actions">
                                <button 
                                  className="doc-note-save-btn"
                                  onClick={() => handleSaveNote(getSelectedPdfData().pdf.pdf_id, highlight.highlight_id)}
                                >
                                  Save
                                </button>
                                <button 
                                  className="doc-note-cancel-btn"
                                  onClick={handleCancelEditNote}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            highlight.note && (
                              <div className="doc-highlight-notes-section">
                                <div className="doc-highlight-notes-label">Notes</div>
                                <p className="doc-highlight-notes-text">{highlight.note}</p>
                              </div>
                            )
                          )}
                          <div className="doc-highlight-actions-row">
                            {!highlight.note && editingNoteId !== highlight.highlight_id && (
                              <button 
                                className="doc-highlight-add-note-btn"
                                onClick={() => handleStartEditNote(highlight)}
                                title="Add note"
                              >
                                <span>+ Add Note</span>
                              </button>
                            )}
                            {highlight.note && editingNoteId !== highlight.highlight_id && (
                              <button 
                                className="doc-highlight-edit-note-btn"
                                onClick={() => handleStartEditNote(highlight)}
                                title="Edit note"
                              >
                                <span>Edit Note</span>
                              </button>
                            )}
                            <button 
                              className="doc-highlight-attach-btn"
                              onClick={() => handleAttachPdfHighlight(highlight, getSelectedPdfData().pdf)}
                              title="Attach to chat"
                            >
                              <AttachIcon />
                              <span>Attach</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Document Highlights Grid View - Figma Design */
              pdfLoading ? (
                <div className="loading-message">Loading documents...</div>
              ) : !selectedProjectId ? (
                <div className="empty-state">
                  <p>No project selected.</p>
                </div>
              ) : (
                <div className="document-highlights-view">
                  {/* Hidden file input for upload */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePdfUpload}
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                  />
                  
                  {/* Upload button - right aligned in separate div */}
                  <div className={`highlights-upload-section ${isChatCollapsed && activeTabType === 'pdf' ? 'chat-collapsed' : ''}`}>
                    <button
                      className="highlights-upload-button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPdf}
                      title="Upload PDF, JPG, or PNG"
                    >
                      <ShareUploadIcon />
                      <span>{uploadingPdf ? 'Uploading...' : 'Upload New'}</span>
                    </button>
                  </div>
                  
                  {/* Sources title, search bar, and table in separate div */}
                  <div className={`highlights-content-section ${isChatCollapsed && activeTabType === 'pdf' ? 'chat-collapsed' : ''}`}>
                    <div className="highlights-title-search">
                      <h2 className="highlights-title">Sources</h2>
                      <div className="highlights-search-container">
                        <div className="highlights-search-bar">
                          <SearchIconSvg className="highlights-search-icon" />
                          <input
                            type="text"
                            className="highlights-search-input"
                            placeholder="Search...."
                            value={pdfSearchQuery || ''}
                            onChange={(e) => setPdfSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  
                    {(pdfs.length === 0 && highlightsUrls.length === 0) ? (
                      <div className="document-highlights-empty">
                        <BookIconLarge />
                        <p>No highlights saved yet.</p>
                        <p className="empty-hint">Click "Upload New" to add a PDF, JPG, or PNG file, or use the browser extension to highlight text on web pages.</p>
                      </div>
                    ) : (
                      <div 
                        className="highlights-table-container"
                        ref={tableScrollRef}
                        onScroll={handleTableScroll}
                      >
                      {(() => {
                        const groupedPdfs = groupPdfsByTime(pdfs);
                        const groupedUrls = groupUrlsByTime(highlightsUrls);
                        
                        // Filter PDFs by search query
                        const filterPdfs = (pdfList) => {
                          if (!pdfSearchQuery.trim()) return pdfList;
                          const query = pdfSearchQuery.toLowerCase();
                          return pdfList.filter(pdf => {
                            if ((pdf.filename || '').toLowerCase().includes(query)) return true;
                            if (pdf.highlights && Array.isArray(pdf.highlights)) {
                              return pdf.highlights.some(highlight => 
                                (highlight.text || '').toLowerCase().includes(query) ||
                                (highlight.note || '').toLowerCase().includes(query)
                              );
                            }
                            return false;
                          });
                        };
                        
                        // Filter URLs by search query
                        const filterUrls = (urlList) => {
                          if (!pdfSearchQuery.trim()) return urlList;
                          const query = pdfSearchQuery.toLowerCase();
                          return urlList.filter(urlDoc => {
                            if ((urlDoc.page_title || '').toLowerCase().includes(query)) return true;
                            if (extractDomain(urlDoc.source_url).toLowerCase().includes(query)) return true;
                            if ((urlDoc.source_url || '').toLowerCase().includes(query)) return true;
                            if (urlDoc.highlights && Array.isArray(urlDoc.highlights)) {
                              return urlDoc.highlights.some(highlight => 
                                (highlight.text || '').toLowerCase().includes(query) ||
                                (highlight.note || '').toLowerCase().includes(query)
                              );
                            }
                            return false;
                          });
                        };
                        
                        const filteredPdfs = filterPdfs(groupedPdfs.nonArchived);
                        const filteredUrls = filterUrls(groupedUrls.nonArchived);
                        
                        // Combine and sort all items by date (newest first)
                        const allItems = [
                          ...filteredPdfs.map(pdf => ({ type: 'pdf', data: pdf, date: new Date(pdf.updated_at || pdf.created_at) })),
                          ...filteredUrls.map(url => ({ type: 'url', data: url, date: new Date(url.updated_at) }))
                        ].sort((a, b) => b.date - a.date);
                        
                        // Get visible items for lazy loading
                        const visibleItems = allItems.slice(0, visibleRowsCount);
                        
                        return (
                          <table className="highlights-table">
                            <thead>
                              <tr className="highlights-table-header-row">
                                <th className="highlights-table-header-cell highlights-table-number-cell"></th>
                                <th className="highlights-table-header-cell highlights-table-name-cell">Name</th>
                                <th className="highlights-table-header-cell highlights-table-highlights-cell">Highlights</th>
                                <th className="highlights-table-header-cell highlights-table-used-in-cell">Used In</th>
                                <th className="highlights-table-header-cell highlights-table-date-cell">Last Updated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleItems.map((item, idx) => {
                                const isPdf = item.type === 'pdf';
                                const data = item.data;
                                const isImage = isPdf && data.content_type && (
                                  data.content_type.startsWith('image/') || 
                                  data.content_type === 'image/jpeg' || 
                                  data.content_type === 'image/png' || 
                                  data.content_type === 'image/jpg'
                                );
                                
                                return (
                                  <tr 
                                    key={`${item.type}-${idx}`}
                                    className="highlights-table-row"
                                    onClick={() => isPdf ? handlePdfClick(data) : handleUrlClick(data)}
                                  >
                                    <td className="highlights-table-cell highlights-table-number-cell">
                                      {idx + 1}.
                                    </td>
                                    <td className="highlights-table-cell highlights-table-name-cell">
                                      <div className="highlights-table-name-content">
                                        {isPdf ? (
                                          <img 
                                            src={isImage ? highlightsImageIcon : highlightsPdfIcon} 
                                            alt={isImage ? 'Image' : 'PDF'}
                                            className="highlights-table-icon"
                                          />
                                        ) : (
                                          <div className="highlights-table-icon">
                                            {getFaviconUrl(data.source_url) ? (
                                              <img 
                                                src={getFaviconUrl(data.source_url)} 
                                                alt={extractDomain(data.source_url)}
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                              />
                                            ) : (
                                              <GlobeIconCard />
                                            )}
                                          </div>
                                        )}
                                        <div className="highlights-table-name-text">
                                          {isPdf ? (
                                            <span className="highlights-table-name-bold">{data.filename}</span>
                                          ) : (
                                            <>
                                              <span className="highlights-table-name-domain">{extractDomain(data.source_url)} </span>
                                              <span className="highlights-table-name-bold">{data.page_title || 'Untitled Page'}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="highlights-table-cell highlights-table-highlights-cell">
                                      {isPdf && (data.extraction_status === 'processing' || data.extraction_status === 'pending') ? (
                                        <div className="highlights-loading-spinner">
                                          <div className="spinner-small"></div>
                                        </div>
                                      ) : (
                                        data.highlights?.length || 0
                                      )}
                                    </td>
                                    <td className="highlights-table-cell highlights-table-used-in-cell">
                                      <div className="highlights-table-used-in-content">
                                        <span className="highlights-table-used-in-text">Document_Name with max limit</span>
                                        <span className="highlights-table-used-in-badge">+3</span>
                                      </div>
                                    </td>
                                    <td className="highlights-table-cell highlights-table-date-cell">
                                      <div>
                                        <span>{formatTableDate(data.updated_at)}</span>
                                        <div style={{ position: 'relative' }}>
                                          <button
                                            className="source-menu-button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const menuId = `${item.type}-${idx}`;
                                              if (openSourceMenuId === menuId) {
                                                setOpenSourceMenuId(null);
                                              } else {
                                                setOpenSourceMenuId(menuId);
                                                // Calculate position for fixed dropdown
                                                setTimeout(() => {
                                                  const button = e.currentTarget;
                                                  if (button && button.getBoundingClientRect) {
                                                    const rect = button.getBoundingClientRect();
                                                    const menuRef = sourceMenuRefs.current[menuId];
                                                    if (menuRef) {
                                                      menuRef.style.top = `${rect.bottom + 4}px`;
                                                      menuRef.style.right = `${window.innerWidth - rect.right}px`;
                                                    }
                                                  }
                                                }, 0);
                                              }
                                            }}
                                            style={{
                                              opacity: openSourceMenuId === `${item.type}-${idx}` ? 1 : 0.5
                                            }}
                                          >
                                            <img src={moreMenuIcon} alt="More options" />
                                          </button>
                                          {openSourceMenuId === `${item.type}-${idx}` && (
                                            <div
                                              ref={(el) => {
                                                if (el) {
                                                  sourceMenuRefs.current[`${item.type}-${idx}`] = el;
                                                  // Calculate position on mount
                                                  setTimeout(() => {
                                                    const parent = el.parentElement;
                                                    const button = parent?.querySelector('.source-menu-button');
                                                    if (button && button.getBoundingClientRect) {
                                                      const rect = button.getBoundingClientRect();
                                                      el.style.top = `${rect.bottom + 4}px`;
                                                      el.style.right = `${window.innerWidth - rect.right}px`;
                                                    }
                                                  }, 0);
                                                }
                                              }}
                                              className="source-menu-dropdown"
                                            >
                                              <button
                                                className="source-menu-item"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteSource(data, isPdf);
                                                }}
                                              >
                                                <img src={deleteIcon} alt="Delete" />
                                                <span>Delete</span>
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        );
                      })()}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Research Output Documents Tab Content - Written Documents Grid View */}
        {activeTabType === 'researchdocs' && (
          <div className="researchdocs-content">
            {loading ? (
              <div className="loading-message">Loading research documents...</div>
            ) : !selectedProjectId ? (
              <div className="empty-state">
                <p>No project selected.</p>
              </div>
            ) : (
              <div className="written-documents-view">
                {/* Header with Title, Search Bar and Create New Button */}
                <SectionHeader
                  title="All Documents"
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search for documents...."
                  ctaType="create"
                  ctaOnClick={handleCreateNewDocument}
                  ctaDisabled={!selectedProjectId}
                  ctaText="Create New"
                />
                
                {availableDocuments.length === 0 ? (
                  <div className="written-documents-empty">
                    <FileDocumentIconLarge />
                    <p>No research documents yet.</p>
                    <p className="empty-hint">Click "Create New" to start writing, or use the chat to build research documents.</p>
                  </div>
                ) : (
                  <div className="written-documents-sections">
                    {/* Group Documents by time */}
                    {(() => {
                      const grouped = groupDocsByTime(availableDocuments);
                      
                      // Helper function to render a document card
                      const renderDocumentCard = (doc, key) => (
                        <div 
                          key={key}
                          className="written-doc-card"
                          onClick={() => handleResearchDocClick(doc)}
                        >
                          <div className="written-card-thumbnail">
                            {doc.snapshot ? (
                              <img src={doc.snapshot} alt={doc.title} className="written-card-snapshot" />
                            ) : (
                              <div className="written-card-thumbnail-placeholder">
                                <span className="txt-placeholder">TXT</span>
                              </div>
                            )}
                          </div>
                          <div className="written-card-content">
                            <div className="written-card-title-section">
                              <p className="written-card-title">{doc.title || 'Untitled Document'}</p>
                            </div>
                            <div className="written-card-date">
                              <span>{formatLastUpdatedTime(doc.updated_at || doc.created_at)}</span>
                            </div>
                          </div>
                          <CardMenu
                            itemId={doc.document_id}
                            isArchived={doc.archived || false}
                            onRename={async () => {
                              const newTitle = prompt('Enter new title:', doc.title);
                              if (newTitle && newTitle.trim() && newTitle !== doc.title) {
                                try {
                                  await documentAPI.renameDocument(doc.document_id, newTitle);
                                  if (selectedProjectId) {
                                    loadAvailableDocuments(selectedProjectId);
                                  }
                                } catch (error) {
                                  console.error('Failed to rename document:', error);
                                  alert('Failed to rename document. Please try again.');
                                }
                              }
                            }}
                            onArchive={async () => {
                              try {
                                await documentAPI.archiveDocument(doc.document_id);
                                // Invalidate documents cache
                                try {
                                  console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
                                  const keys = [getCacheKey('documents', selectedProjectId)];
                                  keys.forEach(k => localStorage.removeItem(k));
                                  console.log('[CACHE] Cleared cache keys:', keys);
                                } catch (e) {
                                  console.warn('Failed to invalidate cache after archive:', e);
                                }
                                if (selectedProjectId) {
                                  loadAvailableDocuments(selectedProjectId);
                                }
                              } catch (error) {
                                console.error('Failed to archive document:', error);
                                alert('Failed to archive document. Please try again.');
                              }
                            }}
                            onUnarchive={async () => {
                              try {
                                await documentAPI.unarchiveDocument(doc.document_id);
                                // Invalidate documents cache
                                try {
                                  console.log('[CACHE] Invalidating cache for project:', selectedProjectId);
                                  const keys = [getCacheKey('documents', selectedProjectId)];
                                  keys.forEach(k => localStorage.removeItem(k));
                                  console.log('[CACHE] Cleared cache keys:', keys);
                                } catch (e) {
                                  console.warn('Failed to invalidate cache after unarchive:', e);
                                }
                                if (selectedProjectId) {
                                  loadAvailableDocuments(selectedProjectId);
                                }
                              } catch (error) {
                                console.error('Failed to unarchive document:', error);
                                alert('Failed to unarchive document. Please try again.');
                              }
                            }}
                          />
                        </div>
                      );
                      
                      // Filter documents by search query
                      const filterDocuments = (docs) => {
                        if (!searchQuery.trim()) return docs;
                        const query = searchQuery.toLowerCase();
                        return docs.filter(doc => 
                          (doc.title || '').toLowerCase().includes(query)
                        );
                      };

                      // Filter grouped documents
                      const filteredGrouped = {
                        nonArchived: filterDocuments(grouped.nonArchived),
                        archived: []
                      };
                      
                      // Helper function to render a collapsible section
                      const renderSection = (label, items, sectionKey, isArchived = false) => {
                        if (items.length === 0) return null;
                        const isExpanded = isTimeSectionExpanded(sectionKey);
                        
                        return (
                          <div className={`highlights-time-section ${isArchived ? 'archived' : ''}`}>
                            <div 
                              className="highlights-time-section-header"
                              onClick={() => toggleTimeSection(sectionKey)}
                            >
                              <div className={`highlights-time-section-caret ${!isExpanded ? 'collapsed' : ''}`}>
                                <ChevronMdSvg className="highlights-time-section-caret-icon" />
                              </div>
                              {label && <p className="highlights-section-label">{label}</p>}
                            </div>
                            {isExpanded && (
                              <div className="highlights-cards-grid">
                                {items.map((doc, idx) => renderDocumentCard(doc, `${sectionKey}-${idx}`))}
                              </div>
                            )}
                          </div>
                        );
                      };
                      
                      return (
                        <>
                          {/* Documents (sorted by date, newest first) */}
                          {filteredGrouped.nonArchived.length > 0 && (
                            <div className="highlights-time-section">
                              <div className="highlights-cards-grid">
                                {filteredGrouped.nonArchived.map((doc, idx) => renderDocumentCard(doc, `nonArchived-${idx}`))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Document Tab Content */}
        {activeTabType === 'document' && (
          <>
            {loading && !content && activeDocumentId && (
              <div className="loading-message">Loading document...</div>
            )}
            
            {/* Show Add New Tab UI when no document is active or when showDocumentList is true */}
            {(!activeDocumentId || showDocumentList) && (
              <AddNewTabView
                researchDocuments={availableDocuments}
                urlHighlights={highlightsUrls}
                pdfDocuments={pdfs}
                onCreateNewDocument={() => {
                  // Create a new research document and open it
                  handleCreateNewDocument();
                }}
                onOpenDocument={(doc) => {
                  // Open existing research document in a new tab
                  handleSelectExistingDocument(doc.document_id);
                }}
                onOpenUrlHighlight={(urlDoc) => {
                  // Create a new highlights tab and open this URL
                  const newTabId = `highlights-${Date.now()}`;
                  const newTab = { id: newTabId, selectedUrlData: null, createdAt: Date.now() };
                  setHighlightsTabs(prev => [...prev, newTab]);
                  setTabOrder(prev => [...prev, { id: newTabId, type: 'highlights' }]);
                  setActiveTabId(newTabId);
                  setActiveTabType('highlights');
                  setShowDocumentList(false);
                  // After tab is created, select the URL
                  setTimeout(() => {
                    handleUrlClick(urlDoc);
                  }, 50);
                }}
                onOpenPdfDocument={(pdf) => {
                  // Create a new PDF tab and open this PDF
                  const newTabId = `pdf-${Date.now()}`;
                  // Set initial PDF data immediately so PDF viewer can start loading
                  const initialData = {
                    projectId: selectedProjectId,
                    pdf,
                    highlights: [],
                    extractionStatus: 'pending',
                    extractionError: null
                  };
                  const newTab = { id: newTabId, selectedPdfData: initialData, createdAt: Date.now() };
                  setPdfTabs(prev => [...prev, newTab]);
                  setTabOrder(prev => [...prev, { id: newTabId, type: 'pdf' }]);
                  setActiveTabId(newTabId);
                  setActiveTabType('pdf');
                  setShowDocumentList(false);
                  // After tab is created, fetch highlights in background
                  setTimeout(() => {
                    pdfAPI.getHighlights(pdf.pdf_id)
                      .then((highlightsResponse) => {
                        const selectedData = {
                          projectId: selectedProjectId,
                          pdf,
                          highlights: highlightsResponse.data.highlights || [],
                          extractionStatus: highlightsResponse.data.extraction_status,
                          extractionError: highlightsResponse.data.extraction_error
                        };
                        setPdfTabs(prev => prev.map(tab => 
                          tab.id === newTabId ? { ...tab, selectedPdfData: selectedData } : tab
                        ));
                      })
                      .catch((err) => {
                        console.error('Failed to load PDF highlights:', err);
                        setPdfTabs(prev => prev.map(tab => 
                          tab.id === newTabId ? { 
                            ...tab, 
                            selectedPdfData: {
                              ...tab.selectedPdfData,
                              extractionStatus: 'failed',
                              extractionError: 'Failed to load highlights'
                            }
                          } : tab
                        ));
                      });
                  }, 50);
                }}
                onUploadPdf={() => {
                  // Create a PDF tab and trigger file upload
                  const newTabId = `pdf-${Date.now()}`;
                  const newTab = { id: newTabId, selectedPdfData: null, createdAt: Date.now() };
                  setPdfTabs(prev => [...prev, newTab]);
                  setTabOrder(prev => [...prev, { id: newTabId, type: 'pdf' }]);
                  setActiveTabId(newTabId);
                  setActiveTabType('pdf');
                  setShowDocumentList(false);
                  // Trigger file input after switching tabs
                  setTimeout(() => {
                    fileInputRef.current?.click();
                  }, 100);
                }}
                onRefreshDocuments={() => {
                  if (selectedProjectId) {
                    loadAvailableDocuments(selectedProjectId);
                  }
                }}
              />
            )}
            {!loading && !error && activeDocumentId && !showDocumentList && (
              <div className="document-editor-wrapper">
                <RichTextEditor
                  ref={editorRef}
                  value={htmlContent}
                  onChange={handleEditorChange}
                  placeholder=""
                  documentName={getActiveDocument()?.title || 'Untitled Document'}
                  onDocumentNameClick={handleDocumentNameClick}
                  isEditingDocumentName={isEditingDocumentName}
                  editingDocumentName={editingDocumentName}
                  onDocumentNameChange={(e) => setEditingDocumentName(e.target.value)}
                  onDocumentNameBlur={handleDocumentNameBlur}
                  onDocumentNameKeyPress={handleDocumentNameKeyPress}
                  saveStatus={saveStatus}
                  onReferencesClick={() => {}}
                  onMenuClick={toggleDocMenu}
                />
                {isDocMenuOpen && (
                  <div className="doc-menu-dropdown" role="menu" ref={docMenuRef}>
                    <button type="button" className="doc-menu-item" onClick={handleVersionHistory}>
                      <VersionHistoryIcon />
                      <span>Version History</span>
                    </button>
                    <button type="button" className="doc-menu-item" onClick={handleDownloadDocument}>
                      <DownloadIcon />
                      <span>Download</span>
                    </button>
                  </div>
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

