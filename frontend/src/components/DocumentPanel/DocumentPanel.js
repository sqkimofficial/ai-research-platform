import React, { useState, useEffect, useRef, useCallback } from 'react';
import { documentAPI, projectAPI, highlightsAPI, pdfAPI } from '../../services/api';
import { getToken } from '../../utils/auth';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdownConverter';
import RichTextEditor from './RichTextEditor';
import AddNewTabView from './AddNewTabView';
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

const DocumentPanel = ({ refreshTrigger, selectedProjectId: propSelectedProjectId, currentProjectName: propCurrentProjectName, onAttachSections, onAttachHighlight, onActiveDocumentChange, highlightsTabTrigger, pdfTabTrigger, researchDocsTabTrigger }) => {
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
  const pollingIntervalRef = useRef(null);
  const docMenuRef = useRef(null);
  const [isDocMenuOpen, setIsDocMenuOpen] = useState(false);
  
  // Research Output Documents state
  const [researchDocsTabs, setResearchDocsTabs] = useState([]); // Array of { id, createdAt }
  const [documentWordCounts, setDocumentWordCounts] = useState({}); // { document_id: wordCount }
  
  // Pending new tab view state - shows the list view without creating an actual tab
  // Can be 'highlights', 'pdf', 'researchdocs', or null
  const [pendingNewTabType, setPendingNewTabType] = useState(null);
  
  // Tab order array - stores tab IDs in creation order for proper rendering
  // Each entry is { id: string, type: 'document' | 'highlights' | 'pdf' | 'researchdocs' }
  const [tabOrder, setTabOrder] = useState([]);
  
  // PDF highlight note editing state
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Auto-poll for PDF extraction status updates
  useEffect(() => {
    const pollForUpdates = async () => {
      // Check if any PDFs in current project are still processing
      if (selectedProjectId && pdfs.some(pdf => pdf.extraction_status === 'processing')) {
        try {
          const response = await pdfAPI.getPDFs(selectedProjectId);
          setPdfs(response.data.pdfs || []);
        } catch (err) {
          console.error('Failed to poll PDF status:', err);
        }
      }

      // Also check if currently viewing a PDF that's still processing
      const activePdfTab = pdfTabs.find(tab => tab.id === activeTabId);
      if (activePdfTab?.selectedPdfData?.extractionStatus === 'processing') {
        try {
          const response = await pdfAPI.getHighlights(activePdfTab.selectedPdfData.pdf.pdf_id);
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
          console.error('Failed to poll PDF highlights:', err);
        }
      }
    };

    // Start polling if we're on a PDF tab
    if (activeTabType === 'pdf') {
      pollingIntervalRef.current = setInterval(pollForUpdates, 3000); // Poll every 3 seconds
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [activeTabType, activeTabId, selectedProjectId, pdfs, pdfTabs]);

  // Sync with prop selectedProjectId - this is the primary source of truth
  useEffect(() => {
    if (propSelectedProjectId) {
      setSelectedProjectId(propSelectedProjectId);
      loadAvailableDocuments(propSelectedProjectId);
      loadHighlightsForProject(propSelectedProjectId);
      loadPdfsForProject(propSelectedProjectId);
    }
  }, [propSelectedProjectId]);

  // Show document list when no documents are open
  useEffect(() => {
    if (documents.length === 0 && selectedProjectId) {
      setShowDocumentList(true);
    }
  }, [documents.length, selectedProjectId]);

  // Close the document options dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (docMenuRef.current && !docMenuRef.current.contains(event.target)) {
        setIsDocMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsDocMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keyup', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keyup', handleEscape);
    };
  }, []);

  // Load available documents for the project
  const loadAvailableDocuments = async (projectId) => {
    try {
      const response = await documentAPI.getAllResearchDocuments(projectId);
      const docs = response.data.documents || [];
      setAvailableDocuments(docs);
      setError(''); // Clear any previous errors
      
      // Fetch word counts for documents
      fetchWordCountsForDocuments(docs);
    } catch (err) {
      console.error('Failed to load available documents:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load documents';
      setError(errorMessage);
    }
  };

  // Fetch word counts for a list of documents
  const fetchWordCountsForDocuments = async (docs) => {
    const wordCounts = { ...documentWordCounts };
    
    // Fetch content for each document that doesn't have a word count yet
    for (const doc of docs) {
      if (wordCounts[doc.document_id] === undefined) {
        try {
          const response = await documentAPI.getDocument(null, doc.document_id);
          const content = response.data.content || '';
          wordCounts[doc.document_id] = getWordCount(content);
        } catch (err) {
          console.error(`Failed to fetch content for document ${doc.document_id}:`, err);
          wordCounts[doc.document_id] = 0;
        }
      }
    }
    
    setDocumentWordCounts(wordCounts);
  };


  // Show pending highlights view when trigger changes (no tab created yet)
  useEffect(() => {
    if (highlightsTabTrigger > 0) {
      // Just show the pending view - don't create a tab yet
      setPendingNewTabType('highlights');
      setActiveTabId(null);
      setActiveTabType('highlights');
      
      if (selectedProjectId) {
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
    try {
      setHighlightsLoading(true);
      const response = await highlightsAPI.getHighlights(projectId);
      setHighlightsUrls(response.data.highlights || []);
    } catch (err) {
      console.error('Failed to load highlights:', err);
      setError('Failed to load highlights.');
    } finally {
      setHighlightsLoading(false);
    }
  };

  // Load PDFs for current project
  const loadPdfsForProject = async (projectId) => {
    try {
      setPdfLoading(true);
      const response = await pdfAPI.getPDFs(projectId);
      setPdfs(response.data.pdfs || []);
    } catch (err) {
      console.error('Failed to load PDFs:', err);
      setError('Failed to load PDFs.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePdfClick = async (pdf) => {
    try {
      // Fetch highlights for the PDF
      const highlightsResponse = await pdfAPI.getHighlights(pdf.pdf_id);
      const selectedData = {
        projectId: selectedProjectId,
        pdf,
        highlights: highlightsResponse.data.highlights || [],
        extractionStatus: highlightsResponse.data.extraction_status,
        extractionError: highlightsResponse.data.extraction_error
      };
      
      // If we're in pending state (no tab created yet), create a new tab with the selected data
      if (pendingNewTabType === 'pdf') {
        const newTabId = `pdf-${Date.now()}`;
        const newTab = { id: newTabId, selectedPdfData: selectedData, createdAt: Date.now() };
        setPdfTabs(prev => [...prev, newTab]);
        setTabOrder(prev => [...prev, { id: newTabId, type: 'pdf' }]);
        setActiveTabId(newTabId);
        setPendingNewTabType(null); // Clear pending state
      } else {
        // Update the selectedPdfData for the active PDF tab
        setPdfTabs(prev => prev.map(tab => 
          tab.id === activeTabId ? { ...tab, selectedPdfData: selectedData } : tab
        ));
      }
    } catch (err) {
      console.error('Failed to load PDF highlights:', err);
      setError('Failed to load PDF highlights.');
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
      
      await pdfAPI.uploadPDF(selectedProjectId, file);
      
      // Reload PDFs for the project
      await loadPdfsForProject(selectedProjectId);
      
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
    
    // If we're in pending state (no tab created yet), create a new tab with the selected data
    if (pendingNewTabType === 'highlights') {
      const newTabId = `highlights-${Date.now()}`;
      const newTab = { id: newTabId, selectedUrlData: selectedData, createdAt: Date.now() };
      setHighlightsTabs(prev => [...prev, newTab]);
      setTabOrder(prev => [...prev, { id: newTabId, type: 'highlights' }]);
      setActiveTabId(newTabId);
      setPendingNewTabType(null); // Clear pending state
    } else {
      // Update the selectedUrlData for the active highlights tab
      setHighlightsTabs(prev => prev.map(tab => 
        tab.id === activeTabId ? { ...tab, selectedUrlData: selectedData } : tab
      ));
    }
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

  // Group PDFs by time period (Today, Last 7 Days, Archived)
  const groupPdfsByTime = (pdfList) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const groups = {
      today: [],
      last7Days: [],
      archived: []
    };
    
    pdfList.forEach(pdf => {
      const pdfDate = new Date(pdf.updated_at || pdf.created_at);
      const pdfDateOnly = new Date(pdfDate.getFullYear(), pdfDate.getMonth(), pdfDate.getDate());
      
      // For now, we'll use a simple archived flag (to be implemented later)
      // Documents older than 30 days will be considered archived for demo
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      if (pdf.archived) {
        groups.archived.push(pdf);
      } else if (pdfDateOnly >= today) {
        groups.today.push(pdf);
      } else if (pdfDateOnly >= sevenDaysAgo) {
        groups.last7Days.push(pdf);
      } else if (pdfDateOnly < thirtyDaysAgo) {
        groups.archived.push(pdf);
      } else {
        groups.last7Days.push(pdf);
      }
    });
    
    return groups;
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

  // Group URL highlights by time period (Today, Archived)
  const groupUrlsByTime = (urlList) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const groups = {
      today: [],
      last7Days: [],
      archived: []
    };
    
    urlList.forEach(urlDoc => {
      const urlDate = new Date(urlDoc.updated_at || urlDoc.created_at);
      const urlDateOnly = new Date(urlDate.getFullYear(), urlDate.getMonth(), urlDate.getDate());
      
      // Documents older than 30 days will be considered archived for demo
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      if (urlDoc.archived) {
        groups.archived.push(urlDoc);
      } else if (urlDateOnly >= today) {
        groups.today.push(urlDoc);
      } else if (urlDateOnly >= sevenDaysAgo) {
        groups.last7Days.push(urlDoc);
      } else if (urlDateOnly < thirtyDaysAgo) {
        groups.archived.push(urlDoc);
      } else {
        groups.last7Days.push(urlDoc);
      }
    });
    
    return groups;
  };

  // Group research documents by time period (Today, Last 7 Days, Archived)
  const groupDocsByTime = (docList) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const groups = {
      today: [],
      last7Days: [],
      archived: []
    };
    
    docList.forEach(doc => {
      const docDate = new Date(doc.updated_at || doc.created_at);
      const docDateOnly = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());
      
      // Documents older than 30 days will be considered archived for demo
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      if (doc.archived) {
        groups.archived.push(doc);
      } else if (docDateOnly >= today) {
        groups.today.push(doc);
      } else if (docDateOnly >= sevenDaysAgo) {
        groups.last7Days.push(doc);
      } else if (docDateOnly < thirtyDaysAgo) {
        groups.archived.push(doc);
      } else {
        groups.last7Days.push(doc);
      }
    });
    
    return groups;
  };

  // Calculate word count from content (approximate)
  const getWordCount = (content) => {
    if (!content) return 0;
    // Strip markdown and count words
    const text = content.replace(/[#*_~`\[\](){}|>]/g, '').trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
  };

  const handleDeleteHighlight = async (sourceUrl, highlightId) => {
    if (!window.confirm('Are you sure you want to delete this highlight?')) {
      return;
    }
    
    try {
      await highlightsAPI.deleteHighlight(selectedProjectId, sourceUrl, highlightId);
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
      const response = await documentAPI.getDocument(null, documentId);
      const markdownContent = response.data.content || '';
      setContent(markdownContent);
      // Convert Markdown to HTML for Quill editor
      const html = markdownToHtml(markdownContent);
      setHtmlContent(html);
      setSaveStatus('saved');
      lastSaveTimeRef.current = Date.now();
      pendingContentRef.current = null;
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
  useEffect(() => {
    if (refreshTrigger > 0 && activeDocumentId) {
      setTimeout(() => {
        fetchDocument(activeDocumentId);
      }, 1000);
    }
  }, [refreshTrigger, activeDocumentId]);

  const handleRefresh = () => {
    if (activeDocumentId) {
      fetchDocument(activeDocumentId);
    }
  };


  // Auto-save constants
  const DEBOUNCE_DELAY = 2000; // 2 seconds after user stops typing
  const MAX_SAVE_INTERVAL = 30000; // Force save every 30 seconds

  // Perform the actual save operation
  const performSave = useCallback(async (htmlContentToSave) => {
    if (!activeDocumentId || !htmlContentToSave) {
      return;
    }

    setSaveStatus('saving');
    try {
      // Convert HTML from Quill to Markdown for storage
      const markdownContent = htmlToMarkdown(htmlContentToSave);
      
      await documentAPI.saveDocument(null, markdownContent, 'replace', activeDocumentId);
      setContent(markdownContent);
      setSaveStatus('saved');
      lastSaveTimeRef.current = Date.now();
      pendingContentRef.current = null;
      
      // Update word count for this document
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContentToSave;
      const textContent = tempDiv.textContent || tempDiv.innerText || '';
      setDocumentWordCounts(prev => ({
        ...prev,
        [activeDocumentId]: getWordCount(textContent)
      }));
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to save document:', err);
    }
  }, [activeDocumentId]);

  // Schedule auto-save with debounce
  const scheduleAutoSave = useCallback((newHtmlContent) => {
    // Store pending content
    pendingContentRef.current = newHtmlContent;

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (save after 2s of inactivity)
    debounceTimerRef.current = setTimeout(() => {
      if (pendingContentRef.current) {
        performSave(pendingContentRef.current);
      }
    }, DEBOUNCE_DELAY);

    // Check if we need to force save (max interval)
    const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
    if (timeSinceLastSave >= MAX_SAVE_INTERVAL) {
      // Clear debounce and save immediately
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      performSave(newHtmlContent);
    } else if (!maxIntervalTimerRef.current) {
      // Set max interval timer if not already set
      const remainingTime = MAX_SAVE_INTERVAL - timeSinceLastSave;
      maxIntervalTimerRef.current = setTimeout(() => {
        if (pendingContentRef.current) {
          // Clear debounce timer
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          performSave(pendingContentRef.current);
        }
        maxIntervalTimerRef.current = null;
      }, remainingTime);
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

  // Save on page unload/blur
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingContentRef.current && activeDocumentId) {
        // Try to save synchronously before page unloads
        const markdownContent = htmlToMarkdown(pendingContentRef.current);
        navigator.sendBeacon(
          `/api/document`,
          JSON.stringify({
            document_id: activeDocumentId,
            content: markdownContent,
            mode: 'replace'
          })
        );
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
      
      // Set initial word count for new document (0 words)
      setDocumentWordCounts(prev => ({
        ...prev,
        [newDocId]: 0
      }));
      
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
  };

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
      {/* Tab Bar */}
      <div className="document-tabs">
        {/* Render tabs in creation order using tabOrder */}
        {tabOrder.map((tabEntry) => {
          if (tabEntry.type === 'document') {
            const doc = documents.find(d => d.document_id === tabEntry.id);
            if (!doc) return null;
            // For documents: use title, or "Untitled X" for untitled docs
            const getDocTabTitle = () => {
              if (doc.title && doc.title.trim()) return doc.title;
              // Count untitled docs up to this one for numbering
              const docIndex = documents.findIndex(d => d.document_id === doc.document_id);
              const untitledCount = documents.slice(0, docIndex + 1).filter(d => !d.title || !d.title.trim()).length;
              return untitledCount > 1 ? `Untitled ${untitledCount}` : 'Untitled';
            };
            return (
              <div
                key={doc.document_id}
                className={`document-tab ${activeTabType === 'document' && doc.document_id === activeDocumentId ? 'active' : ''}`}
                onClick={() => handleDocumentTabClick(doc.document_id)}
              >
                <span className="tab-title">{getDocTabTitle()}</span>
                <button
                  className="tab-close-button"
                  onClick={(e) => handleCloseTab(doc.document_id, e)}
                  title="Close tab"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          } else if (tabEntry.type === 'highlights') {
            const tab = highlightsTabs.find(t => t.id === tabEntry.id);
            if (!tab) return null;
            // For web highlights: use page_title if URL is selected, otherwise "Web Highlights"
            const getHighlightsTabTitle = () => {
              if (tab.selectedUrlData?.urlDoc?.page_title) {
                return tab.selectedUrlData.urlDoc.page_title;
              }
              // Fallback for tabs without selected URL
              const tabIndex = highlightsTabs.filter(t => !t.selectedUrlData?.urlDoc?.page_title).findIndex(t => t.id === tab.id);
              return tabIndex > 0 ? `Web Highlights ${tabIndex + 1}` : 'Web Highlights';
            };
            return (
              <div
                key={tab.id}
                className={`document-tab ${activeTabType === 'highlights' && activeTabId === tab.id ? 'active' : ''}`}
                onClick={() => handleHighlightsTabClick(tab.id)}
              >
                <span className="tab-title">{getHighlightsTabTitle()}</span>
                <button
                  className="tab-close-button"
                  onClick={(e) => handleCloseHighlightsTab(tab.id, e)}
                  title="Close highlights tab"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          } else if (tabEntry.type === 'pdf') {
            const tab = pdfTabs.find(t => t.id === tabEntry.id);
            if (!tab) return null;
            // For PDF/document highlights: use filename if PDF is selected, otherwise "Highlight Docs"
            const getPdfTabTitle = () => {
              if (tab.selectedPdfData?.pdf?.filename) {
                return tab.selectedPdfData.pdf.filename;
              }
              // Fallback for tabs without selected PDF
              const tabIndex = pdfTabs.filter(t => !t.selectedPdfData?.pdf?.filename).findIndex(t => t.id === tab.id);
              return tabIndex > 0 ? `Highlight Docs ${tabIndex + 1}` : 'Highlight Docs';
            };
            return (
              <div
                key={tab.id}
                className={`document-tab ${activeTabType === 'pdf' && activeTabId === tab.id ? 'active' : ''}`}
                onClick={() => handlePdfTabClick(tab.id)}
              >
                <span className="tab-title">{getPdfTabTitle()}</span>
                <button
                  className="tab-close-button"
                  onClick={(e) => handleClosePdfTab(tab.id, e)}
                  title="Close Highlight Docs tab"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          } else if (tabEntry.type === 'researchdocs') {
            const tab = researchDocsTabs.find(t => t.id === tabEntry.id);
            if (!tab) return null;
            // For research docs tabs: these show a grid, so use "Research Docs" with numbering if multiple
            const researchTabIndex = researchDocsTabs.findIndex(t => t.id === tab.id);
            return (
              <div
                key={tab.id}
                className={`document-tab ${activeTabType === 'researchdocs' && activeTabId === tab.id ? 'active' : ''}`}
                onClick={() => handleResearchDocsTabClick(tab.id)}
              >
                <span className="tab-title">
                  {researchDocsTabs.length > 1 ? `Research Docs ${researchTabIndex + 1}` : 'Research Docs'}
                </span>
                <button
                  className="tab-close-button"
                  onClick={(e) => handleCloseResearchDocsTab(tab.id, e)}
                  title="Close Research Docs tab"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          }
          return null;
        })}
        {/* Add document button - always visible */}
        <button
          className="add-tab-button"
          onClick={handleAddDocument}
          title="Add document"
        >
          <PlusIcon />
        </button>
      </div>

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
                      <button 
                        className="back-to-list-btn"
                        onClick={handleBackToTable}
                        title="Back to URL list"
                      >
                        <ArrowLeftIcon />
                        <span>Back to URLs</span>
                      </button>
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
                        <button 
                          className="browser-nav-btn"
                          onClick={() => {
                            const iframe = document.querySelector('.highlights-iframe');
                            if (iframe) {
                              iframe.src = iframe.src;
                            }
                          }}
                          title="Refresh"
                        >
                          <RefreshIcon />
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
                  {/* Header with Title */}
                  <div className="url-highlights-header">
                    <h2 className="url-highlights-title">URL Highlights</h2>
                    <button
                      type="button"
                      className="url-open-browser-btn"
                      onClick={() => window.open('https://app.browser', '_blank')}
                    >
                      <WebIcon />
                      <span>Open Browser</span>
                    </button>
                  </div>
                  
                  <div className="url-highlights-sections">
                    {/* Group URLs by time */}
                    {(() => {
                      const grouped = groupUrlsByTime(highlightsUrls);
                      return (
                        <>
                          {/* TODAY Section */}
                          {grouped.today.length > 0 && (
                            <div className="highlights-time-section">
                              <p className="highlights-section-label">TODAY</p>
                              <div className="highlights-cards-grid">
                                {grouped.today.map((urlDoc, idx) => (
                                  <div 
                                    key={`today-${idx}`}
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
                                      <div className="url-card-info">
                                        <div className="url-card-icon">
                                          <GlobeIconCard />
                                        </div>
                                        <div className="url-card-details">
                                          <p className="url-card-title">{urlDoc.page_title || 'Untitled Page'}</p>
                                          <p className="url-card-count">
                                            {urlDoc.highlights?.length || 0} highlight{(urlDoc.highlights?.length || 0) !== 1 ? 's' : ''}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="url-card-date">
                                        <span>Added <strong>{formatHighlightDate(urlDoc.updated_at)}</strong></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* LAST 7 DAYS Section */}
                          {grouped.last7Days.length > 0 && (
                            <div className="highlights-time-section">
                              <p className="highlights-section-label">LAST 7 DAYS</p>
                              <div className="highlights-cards-grid">
                                {grouped.last7Days.map((urlDoc, idx) => (
                                  <div 
                                    key={`last7-${idx}`}
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
                                      <div className="url-card-info">
                                        <div className="url-card-icon">
                                          <GlobeIconCard />
                                        </div>
                                        <div className="url-card-details">
                                          <p className="url-card-title">{urlDoc.page_title || 'Untitled Page'}</p>
                                          <p className="url-card-count">
                                            {urlDoc.highlights?.length || 0} highlight{(urlDoc.highlights?.length || 0) !== 1 ? 's' : ''}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="url-card-date">
                                        <span>Added <strong>{formatHighlightDate(urlDoc.updated_at)}</strong></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* ARCHIVED Section */}
                          {grouped.archived.length > 0 && (
                            <div className="highlights-time-section archived">
                              <p className="highlights-section-label">ARCHIVED</p>
                              <div className="highlights-cards-grid">
                                {grouped.archived.map((urlDoc, idx) => (
                                  <div 
                                    key={`archived-${idx}`}
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
                                      <div className="url-card-info">
                                        <div className="url-card-icon">
                                          <GlobeIconCard />
                                        </div>
                                        <div className="url-card-details">
                                          <p className="url-card-title">{urlDoc.page_title || 'Untitled Page'}</p>
                                          <p className="url-card-count">
                                            {urlDoc.highlights?.length || 0} highlight{(urlDoc.highlights?.length || 0) !== 1 ? 's' : ''}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="url-card-date">
                                        <span>Added <strong>{formatHighlightDate(urlDoc.updated_at)}</strong></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
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
                  {/* PDF Toolbar - simple style with back button */}
                  <div className="doc-viewer-toolbar">
                    <button 
                      className="back-to-list-btn"
                      onClick={handleBackToPdfTable}
                      title="Back to documents"
                    >
                      <ArrowLeftIcon />
                      <span>Back to Documents</span>
                    </button>
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
                  
                  {/* Header with Title and Upload Button */}
                  <div className="document-highlights-header">
                    <h2 className="document-highlights-title">Document Highlights</h2>
                    <button
                      className="upload-new-button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPdf}
                      title="Upload PDF, JPG, or PNG"
                    >
                      <ShareUploadIcon />
                      <span>{uploadingPdf ? 'Uploading...' : 'Upload New'}</span>
                    </button>
                  </div>
                  
                  {pdfs.length === 0 ? (
                    <div className="document-highlights-empty">
                      <BookIconLarge />
                      <p>No documents uploaded yet.</p>
                      <p className="empty-hint">Click "Upload New" to add a PDF, JPG, or PNG file.</p>
                    </div>
                  ) : (
                    <div className="document-highlights-sections">
                      {/* Group PDFs by time */}
                      {(() => {
                        const grouped = groupPdfsByTime(pdfs);
                        return (
                          <>
                            {/* TODAY Section */}
                            {grouped.today.length > 0 && (
                              <div className="highlights-time-section">
                                <p className="highlights-section-label">TODAY</p>
                                <div className="highlights-cards-grid">
                                  {grouped.today.map((pdf, idx) => (
                                    <div 
                                      key={`today-${idx}`}
                                      className="highlight-doc-card"
                                      onClick={() => handlePdfClick(pdf)}
                                    >
                                      <div className="highlight-card-thumbnail">
                                        {pdf.thumbnail_url ? (
                                          <img src={pdf.thumbnail_url} alt={pdf.filename} />
                                        ) : (
                                          <div className="highlight-card-thumbnail-placeholder">
                                            <BookIconLarge />
                                          </div>
                                        )}
                                      </div>
                                      <div className="highlight-card-content">
                                        <div className="highlight-card-info">
                                          <div className="highlight-card-icon">
                                            <BookOpenIconCard />
                                          </div>
                                          <div className="highlight-card-details">
                                            <p className="highlight-card-title">{pdf.filename}</p>
                                            <p className="highlight-card-count">
                                              {pdf.highlights?.length || 0} Highlight{(pdf.highlights?.length || 0) !== 1 ? 's' : ''}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="highlight-card-date">
                                          <span>Added <strong>{formatHighlightDate(pdf.updated_at || pdf.created_at)}</strong></span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* LAST 7 DAYS Section */}
                            {grouped.last7Days.length > 0 && (
                              <div className="highlights-time-section">
                                <p className="highlights-section-label">LAST 7 DAYS</p>
                                <div className="highlights-cards-grid">
                                  {grouped.last7Days.map((pdf, idx) => (
                                    <div 
                                      key={`last7-${idx}`}
                                      className="highlight-doc-card"
                                      onClick={() => handlePdfClick(pdf)}
                                    >
                                      <div className="highlight-card-thumbnail">
                                        {pdf.thumbnail_url ? (
                                          <img src={pdf.thumbnail_url} alt={pdf.filename} />
                                        ) : (
                                          <div className="highlight-card-thumbnail-placeholder">
                                            <BookIconLarge />
                                          </div>
                                        )}
                                      </div>
                                      <div className="highlight-card-content">
                                        <div className="highlight-card-info">
                                          <div className="highlight-card-icon">
                                            <BookOpenIconCard />
                                          </div>
                                          <div className="highlight-card-details">
                                            <p className="highlight-card-title">{pdf.filename}</p>
                                            <p className="highlight-card-count">
                                              {pdf.highlights?.length || 0} Highlight{(pdf.highlights?.length || 0) !== 1 ? 's' : ''}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="highlight-card-date">
                                          <span>Added <strong>{formatHighlightDate(pdf.updated_at || pdf.created_at)}</strong></span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* ARCHIVED Section */}
                            {grouped.archived.length > 0 && (
                              <div className="highlights-time-section archived">
                                <p className="highlights-section-label">ARCHIVED</p>
                                <div className="highlights-cards-grid">
                                  {grouped.archived.map((pdf, idx) => (
                                    <div 
                                      key={`archived-${idx}`}
                                      className="highlight-doc-card"
                                      onClick={() => handlePdfClick(pdf)}
                                    >
                                      <div className="highlight-card-thumbnail">
                                        {pdf.thumbnail_url ? (
                                          <img src={pdf.thumbnail_url} alt={pdf.filename} />
                                        ) : (
                                          <div className="highlight-card-thumbnail-placeholder">
                                            <BookIconLarge />
                                          </div>
                                        )}
                                      </div>
                                      <div className="highlight-card-content">
                                        <div className="highlight-card-info">
                                          <div className="highlight-card-icon">
                                            <BookOpenIconCard />
                                          </div>
                                          <div className="highlight-card-details">
                                            <p className="highlight-card-title">{pdf.filename}</p>
                                            <p className="highlight-card-count">
                                              {pdf.highlights?.length || 0} Highlight{(pdf.highlights?.length || 0) !== 1 ? 's' : ''}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="highlight-card-date">
                                          <span>Added <strong>{formatHighlightDate(pdf.updated_at || pdf.created_at)}</strong></span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
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
                {/* Header with Title and Create New Button */}
                <div className="written-documents-header">
                  <h2 className="written-documents-title">Written Documents</h2>
                  <button
                    className="create-new-button"
                    onClick={handleCreateNewDocument}
                    disabled={!selectedProjectId}
                    title="Create new research document"
                  >
                    <NewDocumentIconSvg className="create-new-icon" />
                    Create New
                  </button>
                </div>
                
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
                      return (
                        <>
                          {/* TODAY Section */}
                          {grouped.today.length > 0 && (
                            <div className="highlights-time-section">
                              <p className="highlights-section-label">TODAY</p>
                              <div className="highlights-cards-grid">
                                {grouped.today.map((doc, idx) => (
                                  <div 
                                    key={`today-${idx}`}
                                    className="written-doc-card"
                                    onClick={() => handleResearchDocClick(doc)}
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
                                          <p className="written-card-title">{doc.title || 'Untitled Document'}</p>
                                          <p className="written-card-count">
                                            {documentWordCounts[doc.document_id] !== undefined 
                                              ? `${documentWordCounts[doc.document_id]} words` 
                                              : 'Loading...'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="written-card-date">
                                        <span>Added <strong>{formatHighlightDate(doc.updated_at || doc.created_at)}</strong></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* LAST 7 DAYS Section */}
                          {grouped.last7Days.length > 0 && (
                            <div className="highlights-time-section">
                              <p className="highlights-section-label">LAST 7 DAYS</p>
                              <div className="highlights-cards-grid">
                                {grouped.last7Days.map((doc, idx) => (
                                  <div 
                                    key={`last7-${idx}`}
                                    className="written-doc-card"
                                    onClick={() => handleResearchDocClick(doc)}
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
                                          <p className="written-card-title">{doc.title || 'Untitled Document'}</p>
                                          <p className="written-card-count">
                                            {documentWordCounts[doc.document_id] !== undefined 
                                              ? `${documentWordCounts[doc.document_id]} words` 
                                              : 'Loading...'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="written-card-date">
                                        <span>Added <strong>{formatHighlightDate(doc.updated_at || doc.created_at)}</strong></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* ARCHIVED Section */}
                          {grouped.archived.length > 0 && (
                            <div className="highlights-time-section archived">
                              <p className="highlights-section-label">ARCHIVED</p>
                              <div className="highlights-cards-grid">
                                {grouped.archived.map((doc, idx) => (
                                  <div 
                                    key={`archived-${idx}`}
                                    className="written-doc-card"
                                    onClick={() => handleResearchDocClick(doc)}
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
                                          <p className="written-card-title">{doc.title || 'Untitled Document'}</p>
                                          <p className="written-card-count">
                                            {documentWordCounts[doc.document_id] !== undefined 
                                              ? `${documentWordCounts[doc.document_id]} words` 
                                              : 'Loading...'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="written-card-date">
                                        <span>Added <strong>{formatHighlightDate(doc.updated_at || doc.created_at)}</strong></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
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
                documentWordCounts={documentWordCounts}
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
                  const newTab = { id: newTabId, selectedPdfData: null, createdAt: Date.now() };
                  setPdfTabs(prev => [...prev, newTab]);
                  setTabOrder(prev => [...prev, { id: newTabId, type: 'pdf' }]);
                  setActiveTabId(newTabId);
                  setActiveTabType('pdf');
                  setShowDocumentList(false);
                  // After tab is created, select the PDF
                  setTimeout(() => {
                    handlePdfClick(pdf);
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
              />
            )}
            {!loading && !error && activeDocumentId && !showDocumentList && (
              <div className="document-editor-wrapper">
                <div className="document-editor-toolbar">
                  <div className="document-editor-actions-left">
                    <button 
                      type="button" 
                      className="doc-action-btn doc-undo-btn"
                      onClick={handleUndo}
                      title="Undo (Ctrl+Z)"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 7V13H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 13C3 13 5.5 7 12 7C18.5 7 21 13 21 13V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Undo</span>
                    </button>
                    <button 
                      type="button" 
                      className="doc-action-btn doc-redo-btn"
                      onClick={handleRedo}
                      title="Redo (Ctrl+Shift+Z)"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 7V13H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M21 13C21 13 18.5 7 12 7C5.5 7 3 13 3 13V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Redo</span>
                    </button>
                    <span className={`save-status-indicator ${saveStatus}`}>
                      {saveStatus === 'saving' && (
                        <>
                          <span className="save-spinner"></span>
                          <span>Saving...</span>
                        </>
                      )}
                      {saveStatus === 'saved' && (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>Saved</span>
                        </>
                      )}
                      {saveStatus === 'error' && (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                            <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          <span>Error saving</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="document-editor-actions-right">
                    <button type="button" className="doc-action-btn doc-references-btn">References</button>
                    <div className="doc-menu-wrapper" ref={docMenuRef}>
                      <button
                        type="button"
                        className={`doc-action-btn doc-menu-btn ${isDocMenuOpen ? 'open' : ''}`}
                        aria-label="Document options"
                        aria-expanded={isDocMenuOpen}
                        onClick={toggleDocMenu}
                      >
                        <MenuIcon />
                      </button>
                      {isDocMenuOpen && (
                        <div className="doc-menu-dropdown" role="menu">
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
                  </div>
                </div>
                <RichTextEditor
                  ref={editorRef}
                  value={htmlContent}
                  onChange={handleEditorChange}
                  placeholder="Start writing your research document..."
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentPanel;

