import React, { useState, useEffect, useRef } from 'react';
import { documentAPI, projectAPI, highlightsAPI, pdfAPI } from '../../services/api';
import { getToken } from '../../utils/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import SectionSelector from './SectionSelector';
import './DocumentPanel.css';

// Close icon SVG (X) from Figma
const CloseIcon = ({ color = "rgba(0, 50, 98, 1)" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M5.33337 5.33337L10.6667 10.6667M10.6667 5.33337L5.33337 10.6667" 
      stroke={color} 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Plus icon (rotated close icon) from Figma
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M5.33337 5.33337L10.6667 10.6667M10.6667 5.33337L5.33337 10.6667" 
      stroke="rgba(0, 50, 98, 1)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

const DocumentPanel = ({ refreshTrigger, selectedProjectId: propSelectedProjectId, currentProjectName: propCurrentProjectName, onAttachSections, onAttachHighlight, onActiveDocumentChange, highlightsTabTrigger, pdfTabTrigger }) => {
  const [documents, setDocuments] = useState([]); // All open documents
  const [activeDocumentId, setActiveDocumentId] = useState(null); // Currently active tab
  const [content, setContent] = useState('');
  const [structure, setStructure] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSectionSelector, setShowSectionSelector] = useState(false);
  const [selectedSections, setSelectedSections] = useState([]);
  const [showDocumentList, setShowDocumentList] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [allDocumentsByProject, setAllDocumentsByProject] = useState({}); // { projectId: { projectName, documents: [] } }
  const [viewAllMode, setViewAllMode] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState({}); // { projectId: true/false }
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(propSelectedProjectId);
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [activeTabId, setActiveTabId] = useState(null); // Can be document_id, highlights_tab_id, or pdf_tab_id
  const [activeTabType, setActiveTabType] = useState('document'); // 'document', 'highlights', or 'pdf'
  const [highlightsTabs, setHighlightsTabs] = useState([]); // Array of { id, selectedUrlData }
  const [highlightsProjects, setHighlightsProjects] = useState([]);
  const [highlightsData, setHighlightsData] = useState({});
  const [expandedHighlightsProjects, setExpandedHighlightsProjects] = useState({});
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  
  // PDF-related state
  const [pdfTabs, setPdfTabs] = useState([]); // Array of { id, selectedPdfData }
  const [pdfProjects, setPdfProjects] = useState([]);
  const [pdfData, setPdfData] = useState({}); // { projectId: [pdfs] }
  const [expandedPdfProjects, setExpandedPdfProjects] = useState({});
  const [pdfLoading, setPdfLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  
  // PDF highlight note editing state
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Auto-poll for PDF extraction status updates
  useEffect(() => {
    const pollForUpdates = async () => {
      // Check if any expanded project has PDFs in processing state
      for (const projectId of Object.keys(expandedPdfProjects)) {
        if (expandedPdfProjects[projectId] && pdfData[projectId]) {
          const hasProcessing = pdfData[projectId].some(
            pdf => pdf.extraction_status === 'processing'
          );
          if (hasProcessing) {
            // Reload PDFs for this project
            try {
              const response = await pdfAPI.getPDFs(projectId);
              const projectPdfs = response.data.pdfs || [];
              setPdfData(prev => ({
                ...prev,
                [projectId]: projectPdfs
              }));
            } catch (err) {
              console.error('Failed to poll PDF status:', err);
            }
          }
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
  }, [activeTabType, activeTabId, expandedPdfProjects, pdfData, pdfTabs]);

  // Sync with prop selectedProjectId - this is the primary source of truth
  useEffect(() => {
    if (propSelectedProjectId) {
      setSelectedProjectId(propSelectedProjectId);
      loadAvailableDocuments(propSelectedProjectId);
      // Reset view mode when project changes
      setViewAllMode(false);
    }
  }, [propSelectedProjectId]);

  // Show document list when no documents are open
  useEffect(() => {
    if (documents.length === 0 && selectedProjectId) {
      setShowDocumentList(true);
    }
  }, [documents.length, selectedProjectId]);

  // Load available documents for the project
  const loadAvailableDocuments = async (projectId) => {
    try {
      const response = await documentAPI.getAllResearchDocuments(projectId);
      setAvailableDocuments(response.data.documents || []);
      setError(''); // Clear any previous errors
    } catch (err) {
      console.error('Failed to load available documents:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load documents';
      setError(errorMessage);
    }
  };

  // Load all documents from all projects
  const loadAllDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Ensure projects are loaded first
      if (projects.length === 0) {
        const projectsResponse = await projectAPI.getAllProjects();
        const projectsList = projectsResponse.data.projects || [];
        setProjects(projectsList);
      }
      
      // Fetch all documents (no project filter)
      const response = await documentAPI.getAllResearchDocuments();
      const allDocs = response.data.documents || [];
      
      // Group documents by project
      const grouped = {};
      const projectMap = {}; // Map project_id to project_name
      
      // Use current projects state or fetch if needed
      const projectsToUse = projects.length > 0 ? projects : (await projectAPI.getAllProjects()).data.projects || [];
      
      // Create project map from projects list
      projectsToUse.forEach(project => {
        projectMap[project.project_id] = project.project_name;
      });
      
      // Group documents
      allDocs.forEach(doc => {
        const projectId = doc.project_id;
        if (!grouped[projectId]) {
          grouped[projectId] = {
            projectName: projectMap[projectId] || 'Unknown Project',
            documents: []
          };
        }
        grouped[projectId].documents.push(doc);
      });
      
      // Sort documents within each project by updated_at (newest first)
      Object.keys(grouped).forEach(projectId => {
        grouped[projectId].documents.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at || 0);
          const dateB = new Date(b.updated_at || b.created_at || 0);
          return dateB - dateA;
        });
      });
      
      setAllDocumentsByProject(grouped);
      
      // Expand current project by default
      if (selectedProjectId && grouped[selectedProjectId]) {
        setExpandedProjects({ [selectedProjectId]: true });
      } else if (Object.keys(grouped).length > 0) {
        // Expand first project if current project has no documents
        const firstProjectId = Object.keys(grouped)[0];
        setExpandedProjects({ [firstProjectId]: true });
      }
    } catch (err) {
      console.error('Failed to load all documents:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load documents';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAll = async () => {
    setViewAllMode(true);
    await loadAllDocuments();
  };

  const handleViewCurrentProject = () => {
    setViewAllMode(false);
  };

  const toggleProject = (projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // Load projects for document creation
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await projectAPI.getAllProjects();
        setProjects(response.data.projects || []);
      } catch (err) {
        console.error('Failed to load projects:', err);
      }
    };
    loadProjects();
  }, []);

  // Create new highlights tab when trigger changes
  useEffect(() => {
    if (highlightsTabTrigger > 0) {
      const newTabId = `highlights-${Date.now()}`;
      const newTab = { id: newTabId, selectedUrlData: null };
      setHighlightsTabs(prev => [...prev, newTab]);
      setActiveTabId(newTabId);
      setActiveTabType('highlights');
      loadHighlightsProjects();
    }
  }, [highlightsTabTrigger]);

  // Create new PDF tab when trigger changes
  useEffect(() => {
    if (pdfTabTrigger > 0) {
      const newTabId = `pdf-${Date.now()}`;
      const newTab = { id: newTabId, selectedPdfData: null };
      setPdfTabs(prev => [...prev, newTab]);
      setActiveTabId(newTabId);
      setActiveTabType('pdf');
      loadPdfProjects();
    }
  }, [pdfTabTrigger]);

  // Load projects for highlights
  const loadHighlightsProjects = async () => {
    try {
      setHighlightsLoading(true);
      const response = await projectAPI.getAllProjects();
      setHighlightsProjects(response.data.projects || []);
    } catch (err) {
      console.error('Failed to load projects for highlights:', err);
      setError('Failed to load projects for highlights.');
    } finally {
      setHighlightsLoading(false);
    }
  };

  // Load highlights for a project
  const loadHighlightsForProject = async (projectId) => {
    try {
      const response = await highlightsAPI.getHighlights(projectId);
      const projectHighlights = response.data.highlights || [];
      setHighlightsData(prev => ({
        ...prev,
        [projectId]: projectHighlights
      }));
    } catch (err) {
      console.error('Failed to load highlights:', err);
      setError('Failed to load highlights for this project.');
    }
  };

  const toggleHighlightsProject = async (projectId) => {
    const isExpanded = expandedHighlightsProjects[projectId];
    
    if (!isExpanded && !highlightsData[projectId]) {
      await loadHighlightsForProject(projectId);
    }
    
    setExpandedHighlightsProjects(prev => ({
      ...prev,
      [projectId]: !isExpanded
    }));
  };

  // Load projects for PDFs
  const loadPdfProjects = async () => {
    try {
      setPdfLoading(true);
      const response = await projectAPI.getAllProjects();
      setPdfProjects(response.data.projects || []);
    } catch (err) {
      console.error('Failed to load projects for PDFs:', err);
      setError('Failed to load projects for PDFs.');
    } finally {
      setPdfLoading(false);
    }
  };

  // Load PDFs for a project
  const loadPdfsForProject = async (projectId) => {
    try {
      const response = await pdfAPI.getPDFs(projectId);
      const projectPdfs = response.data.pdfs || [];
      setPdfData(prev => ({
        ...prev,
        [projectId]: projectPdfs
      }));
    } catch (err) {
      console.error('Failed to load PDFs:', err);
      setError('Failed to load PDFs for this project.');
    }
  };

  const togglePdfProject = async (projectId) => {
    const isExpanded = expandedPdfProjects[projectId];
    
    if (!isExpanded && !pdfData[projectId]) {
      await loadPdfsForProject(projectId);
    }
    
    setExpandedPdfProjects(prev => ({
      ...prev,
      [projectId]: !isExpanded
    }));
  };

  const handlePdfClick = async (projectId, pdf) => {
    try {
      // Fetch highlights for the PDF
      const highlightsResponse = await pdfAPI.getHighlights(pdf.pdf_id);
      const selectedData = {
        projectId,
        pdf,
        highlights: highlightsResponse.data.highlights || [],
        extractionStatus: highlightsResponse.data.extraction_status,
        extractionError: highlightsResponse.data.extraction_error
      };
      // Update the selectedPdfData for the active PDF tab
      setPdfTabs(prev => prev.map(tab => 
        tab.id === activeTabId ? { ...tab, selectedPdfData: selectedData } : tab
      ));
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

    // Find the expanded project for upload
    const expandedProjectId = Object.keys(expandedPdfProjects).find(id => expandedPdfProjects[id]);
    if (!expandedProjectId) {
      setError('Please expand a project first to upload a document');
      return;
    }

    try {
      setUploadingPdf(true);
      setError('');
      
      await pdfAPI.uploadPDF(expandedProjectId, file);
      
      // Reload PDFs for the project
      await loadPdfsForProject(expandedProjectId);
      
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
  const handleDeletePdf = async (pdfId, projectId) => {
    if (!window.confirm('Are you sure you want to delete this PDF?')) {
      return;
    }

    try {
      await pdfAPI.deletePDF(pdfId);
      await loadPdfsForProject(projectId);
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

  const handleUrlClick = (projectId, urlDoc) => {
    const selectedData = {
      projectId,
      urlDoc,
      highlights: urlDoc.highlights || []
    };
    // Update the selectedUrlData for the active highlights tab
    setHighlightsTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, selectedUrlData: selectedData } : tab
    ));
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

  const handleDeleteHighlight = async (projectId, sourceUrl, highlightId) => {
    if (!window.confirm('Are you sure you want to delete this highlight?')) {
      return;
    }
    
    try {
      await highlightsAPI.deleteHighlight(projectId, sourceUrl, highlightId);
      await loadHighlightsForProject(projectId);
      
      // Update selected URL data in any highlights tabs that are viewing this URL
      setHighlightsTabs(prev => prev.map(tab => {
        if (tab.selectedUrlData && 
            tab.selectedUrlData.projectId === projectId && 
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
      setStructure([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await documentAPI.getDocument(null, documentId);
      const markdownContent = response.data.content || '';
      const documentStructure = response.data.structure || [];
      setContent(markdownContent);
      setStructure(documentStructure);
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
      setStructure([]);
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
    if (!activeDocumentId) {
      setError('No active document');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await documentAPI.saveDocument(null, content, 'replace', activeDocumentId, structure);
      setIsEditing(false);
      await fetchDocument(activeDocumentId);
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
    if (activeDocumentId) {
      fetchDocument(activeDocumentId);
    }
  };

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
      }
    } else {
      // If already on document tab, toggle the document list
      setShowDocumentList(!showDocumentList);
      if (!showDocumentList && selectedProjectId) {
        loadAvailableDocuments(selectedProjectId);
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
      setActiveDocumentId(newDocId);
      setShowDocumentList(false);
      setNewDocumentTitle('');
      
      // Reload available documents
      await loadAvailableDocuments(selectedProjectId);
      
      // If in view all mode, reload all documents too
      if (viewAllMode) {
        await loadAllDocuments();
      }
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
    } else {
      // Add to open documents
      const doc = availableDocuments.find(d => d.document_id === documentId);
      if (doc) {
        setDocuments([...documents, doc]);
        setActiveDocumentId(documentId);
      }
    }
    setShowDocumentList(false);
    setError('');
  };

  const handleCloseTab = (documentId, e) => {
    e.stopPropagation();
    const newDocuments = documents.filter(doc => doc.document_id !== documentId);
    setDocuments(newDocuments);
    
    // If closing active tab, switch to another or clear
    if (documentId === activeDocumentId) {
      if (newDocuments.length > 0) {
        setActiveDocumentId(newDocuments[0].document_id);
      } else {
        setActiveDocumentId(null);
        // Show document list when all tabs are closed
        setShowDocumentList(true);
      }
    }
  };

  const handleCloseHighlightsTab = (tabId, e) => {
    e.stopPropagation();
    const newHighlightsTabs = highlightsTabs.filter(tab => tab.id !== tabId);
    setHighlightsTabs(newHighlightsTabs);
    
    // If closing active tab, switch to another or go to document
    if (tabId === activeTabId) {
      if (newHighlightsTabs.length > 0) {
        setActiveTabId(newHighlightsTabs[0].id);
        setActiveTabType('highlights');
      } else if (documents.length > 0) {
        setActiveTabId(activeDocumentId || documents[0].document_id);
        setActiveTabType('document');
        if (!activeDocumentId) {
          setActiveDocumentId(documents[0].document_id);
        }
      } else {
        setActiveTabId(null);
        setActiveTabType('document');
        setShowDocumentList(true);
      }
    }
  };

  const handleClosePdfTab = (tabId, e) => {
    e.stopPropagation();
    const newPdfTabs = pdfTabs.filter(tab => tab.id !== tabId);
    setPdfTabs(newPdfTabs);
    
    // If closing active tab, switch to another tab or go to document
    if (tabId === activeTabId) {
      if (newPdfTabs.length > 0) {
        setActiveTabId(newPdfTabs[0].id);
        setActiveTabType('pdf');
      } else if (highlightsTabs.length > 0) {
        setActiveTabId(highlightsTabs[0].id);
        setActiveTabType('highlights');
      } else if (documents.length > 0) {
        setActiveTabId(activeDocumentId || documents[0].document_id);
        setActiveTabType('document');
        if (!activeDocumentId) {
          setActiveDocumentId(documents[0].document_id);
        }
      } else {
        setActiveTabId(null);
        setActiveTabType('document');
        setShowDocumentList(true);
      }
    }
  };

  const handleHighlightsTabClick = (tabId) => {
    setActiveTabId(tabId);
    setActiveTabType('highlights');
    if (highlightsProjects.length === 0) {
      loadHighlightsProjects();
    }
  };

  const handlePdfTabClick = (tabId) => {
    setActiveTabId(tabId);
    setActiveTabType('pdf');
    if (pdfProjects.length === 0) {
      loadPdfProjects();
    }
  };

  const handleDocumentTabClick = (documentId) => {
    setActiveTabId(documentId);
    setActiveTabType('document');
    setActiveDocumentId(documentId);
  };

  const getActiveDocument = () => {
    return documents.find(doc => doc.document_id === activeDocumentId);
  };

  return (
    <div className="document-panel">
      {/* Tab Bar */}
      <div className="document-tabs">
        {/* Document tabs */}
        {documents.map((doc) => (
          <div
            key={doc.document_id}
            className={`document-tab ${activeTabType === 'document' && doc.document_id === activeDocumentId ? 'active' : ''}`}
            onClick={() => handleDocumentTabClick(doc.document_id)}
          >
            <span className="tab-title">{doc.title || 'Untitled'}</span>
            <button
              className="tab-close-button"
              onClick={(e) => handleCloseTab(doc.document_id, e)}
              title="Close tab"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
        {/* Highlights tabs */}
        {highlightsTabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`document-tab ${activeTabType === 'highlights' && activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => handleHighlightsTabClick(tab.id)}
          >
            <span className="tab-title">
              Web Highlights {highlightsTabs.length > 1 ? index + 1 : ''}
            </span>
            <button
              className="tab-close-button"
              onClick={(e) => handleCloseHighlightsTab(tab.id, e)}
              title="Close highlights tab"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
        {/* PDF/Image tabs */}
        {pdfTabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`document-tab ${activeTabType === 'pdf' && activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => handlePdfTabClick(tab.id)}
          >
            <span className="tab-title">
              Highlight Docs {pdfTabs.length > 1 ? index + 1 : ''}
            </span>
            <button
              className="tab-close-button"
              onClick={(e) => handleClosePdfTab(tab.id, e)}
              title="Close Highlight Docs tab"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
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
                    <div className="highlights-web-view-header">
                      <button 
                        className="back-to-table-button"
                        onClick={handleBackToTable}
                        title="Back to table"
                      >
                        ← Back
                      </button>
                      <div className="url-info-header">
                        <span className="url-title-header">{getSelectedUrlData().urlDoc.page_title || 'Untitled Page'}</span>
                        <span className="url-text-header">{getSelectedUrlData().urlDoc.source_url}</span>
                      </div>
                    </div>
                    <iframe
                      src={getSelectedUrlData().urlDoc.source_url}
                      className="highlights-iframe"
                      title="Web view"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>
                  <div className="highlights-list-section">
                    <div className="highlights-list-header">
                      <h3>Highlights ({getSelectedUrlData().highlights.length})</h3>
                    </div>
                    <div className="highlights-list-content">
                      {getSelectedUrlData().highlights.length === 0 ? (
                        <div className="no-highlights-message-list">
                          <p>No highlights saved for this URL yet.</p>
                        </div>
                      ) : (
                        getSelectedUrlData().highlights.map((highlight, hIndex) => (
                          <div key={hIndex} className="highlight-item">
                            <div className="highlight-item-header">
                              <span className="highlight-item-icon">✨</span>
                              <span className="highlight-item-date">{formatShortDate(highlight.timestamp)}</span>
                              <button 
                                className="attach-highlight-btn"
                                onClick={() => handleAttachWebHighlight(highlight, getSelectedUrlData().urlDoc)}
                                title="Attach to chat"
                              >
                                📎 Attach
                              </button>
                              <button 
                                className="delete-highlight-btn-item"
                                onClick={() => handleDeleteHighlight(getSelectedUrlData().projectId, getSelectedUrlData().urlDoc.source_url, highlight.highlight_id)}
                                title="Delete highlight"
                              >
                                🗑️
                              </button>
                            </div>
                            <div className="highlight-item-content">
                              <p className="highlight-item-text">"{highlight.text}"</p>
                              {highlight.note && (
                                <div className="highlight-item-note">
                                  <span className="note-label">Note:</span> {highlight.note}
                                </div>
                              )}
                              {highlight.tags && highlight.tags.length > 0 && (
                                <div className="highlight-item-tags">
                                  {highlight.tags.map((tag, tIndex) => (
                                    <span key={tIndex} className="tag">{tag}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
              /* Table View: Projects and URLs */
              highlightsLoading ? (
                <div className="loading-message">Loading highlights...</div>
              ) : highlightsProjects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects yet. Create a project to start saving highlights!</p>
                </div>
              ) : (
                <div className="highlights-table-container">
                  <table className="highlights-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Project / URL</th>
                        <th>Highlights Count</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {highlightsProjects.map((project) => (
                        <React.Fragment key={project.project_id}>
                          {/* Project Row */}
                          <tr 
                            className={`project-row ${expandedHighlightsProjects[project.project_id] ? 'expanded' : ''}`}
                            onClick={() => toggleHighlightsProject(project.project_id)}
                          >
                            <td className="expand-cell">
                              <span className={`expand-icon ${expandedHighlightsProjects[project.project_id] ? 'expanded' : ''}`}>
                                ▶
                              </span>
                            </td>
                            <td className="project-name">
                              <span className="project-icon">📁</span>
                              {project.project_name}
                            </td>
                            <td className="project-description">{project.description || '—'}</td>
                            <td className="project-date">{formatShortDate(project.updated_at)}</td>
                          </tr>

                          {/* URL Rows (when project is expanded) */}
                          {expandedHighlightsProjects[project.project_id] && highlightsData[project.project_id] && (
                            highlightsData[project.project_id].length === 0 ? (
                              <tr className="url-row no-highlights">
                                <td></td>
                                <td colSpan="3" className="no-highlights-message">
                                  No highlights saved for this project yet
                                </td>
                              </tr>
                            ) : (
                              highlightsData[project.project_id].map((urlDoc, urlIndex) => (
                                <tr 
                                  key={`${project.project_id}-url-${urlIndex}`}
                                  className="url-row clickable-url-row"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUrlClick(project.project_id, urlDoc);
                                  }}
                                >
                                  <td className="expand-cell"></td>
                                  <td className="url-cell">
                                    <span className="url-icon">🔗</span>
                                    <div className="url-info">
                                      <span className="url-title">{urlDoc.page_title || 'Untitled Page'}</span>
                                      <span className="url-text">{truncateUrl(urlDoc.source_url)}</span>
                                    </div>
                                  </td>
                                  <td className="highlight-count">
                                    {urlDoc.highlights?.length || 0} highlight{(urlDoc.highlights?.length || 0) !== 1 ? 's' : ''}
                                  </td>
                                  <td className="url-date">{formatShortDate(urlDoc.updated_at)}</td>
                                </tr>
                              ))
                            )
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}

        {/* PDF Tab Content */}
        {activeTabType === 'pdf' && (
          <div className="pdf-content">
            {getSelectedPdfData() ? (
              /* Split View: PDF Viewer (70%) + Highlights List (30%) */
              <div className="pdf-split-view">
                <div className="pdf-viewer-section">
                  <div className="pdf-viewer-header">
                    <button 
                      className="back-to-table-button"
                      onClick={handleBackToPdfTable}
                      title="Back to table"
                    >
                      ← Back
                    </button>
                    <div className="pdf-info-header">
                      <span className="pdf-filename-header">{getSelectedPdfData().pdf.filename}</span>
                      <span className="pdf-status-header">
                        Status: {getSelectedPdfData().extractionStatus}
                        {getSelectedPdfData().extractionStatus === 'processing' && ' (AI is extracting highlights...)'}
                      </span>
                    </div>
                    <button
                      className="refresh-pdf-button"
                      onClick={handleRefreshPdfHighlights}
                      title="Refresh highlights"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                  <iframe
                    src={pdfAPI.getPDFFileUrl(getSelectedPdfData().pdf.pdf_id)}
                    className="pdf-iframe"
                    title="PDF viewer"
                  />
                </div>
                <div className="pdf-highlights-section">
                  <div className="pdf-highlights-header">
                    <h3>Highlights ({getSelectedPdfData().highlights.length})</h3>
                    {getSelectedPdfData().extractionStatus === 'failed' && (
                      <button
                        className="reextract-button"
                        onClick={() => handleReextractHighlights(getSelectedPdfData().pdf.pdf_id)}
                        title="Re-extract highlights"
                      >
                        🔄 Re-extract
                      </button>
                    )}
                  </div>
                  {getSelectedPdfData().extractionError && (
                    <div className="extraction-error">
                      Error: {getSelectedPdfData().extractionError}
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
                        <div key={hIndex} className={`pdf-highlight-item ${getColorClass(highlight.color_tag)}`}>
                          <div className="pdf-highlight-item-header">
                            <span className={`pdf-highlight-color-tag ${getColorClass(highlight.color_tag)}`}>
                              {highlight.color_tag}
                            </span>
                            {highlight.page_number && (
                              <span className="pdf-highlight-page">Page {highlight.page_number}</span>
                            )}
                            <button 
                              className="attach-highlight-btn"
                              onClick={() => handleAttachPdfHighlight(highlight, getSelectedPdfData().pdf)}
                              title="Attach to chat"
                            >
                              📎 Attach
                            </button>
                            <button 
                              className="edit-note-btn-pdf"
                              onClick={() => handleStartEditNote(highlight)}
                              title="Add/Edit note"
                            >
                              📝
                            </button>
                            <button 
                              className="delete-highlight-btn-pdf"
                              onClick={() => handleDeletePdfHighlight(getSelectedPdfData().pdf.pdf_id, highlight.highlight_id)}
                              title="Delete highlight"
                            >
                              🗑️
                            </button>
                          </div>
                          <div className="pdf-highlight-item-content">
                            <p className="pdf-highlight-text">"{highlight.text}"</p>
                            {editingNoteId === highlight.highlight_id ? (
                              <div className="pdf-highlight-note-edit">
                                <textarea
                                  value={editingNoteText}
                                  onChange={(e) => setEditingNoteText(e.target.value)}
                                  placeholder="Add a note..."
                                  className="note-edit-textarea"
                                />
                                <div className="note-edit-actions">
                                  <button 
                                    className="note-save-btn"
                                    onClick={() => handleSaveNote(getSelectedPdfData().pdf.pdf_id, highlight.highlight_id)}
                                  >
                                    Save
                                  </button>
                                  <button 
                                    className="note-cancel-btn"
                                    onClick={handleCancelEditNote}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              highlight.note && (
                                <div className="pdf-highlight-note">
                                  <span className="note-label">Note:</span> {highlight.note}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Table View: Projects and PDFs */
              pdfLoading ? (
                <div className="loading-message">Loading PDFs...</div>
              ) : pdfProjects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects yet. Create a project to start uploading highlight documents!</p>
                </div>
              ) : (
                <div className="pdf-table-container">
                  {/* Hidden file input for upload */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePdfUpload}
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                  />
                  
                  <table className="pdf-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Project / Document</th>
                        <th>Highlights</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pdfProjects.map((project) => (
                        <React.Fragment key={project.project_id}>
                          {/* Project Row */}
                          <tr 
                            className={`project-row ${expandedPdfProjects[project.project_id] ? 'expanded' : ''}`}
                            onClick={() => togglePdfProject(project.project_id)}
                          >
                            <td className="expand-cell">
                              <span className={`expand-icon ${expandedPdfProjects[project.project_id] ? 'expanded' : ''}`}>
                                ▶
                              </span>
                            </td>
                            <td className="project-name">
                              <span className="project-icon">📁</span>
                              {project.project_name}
                            </td>
                            <td className="project-description">{project.description || '—'}</td>
                            <td></td>
                            <td className="project-date">{formatShortDate(project.updated_at)}</td>
                            <td className="project-actions">
                              {expandedPdfProjects[project.project_id] && (
                                <button
                                  className="upload-pdf-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current?.click();
                                  }}
                                  disabled={uploadingPdf}
                                  title="Upload PDF, JPG, or PNG"
                                >
                                  {uploadingPdf ? '⏳' : '➕'} Upload
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* PDF Rows (when project is expanded) */}
                          {expandedPdfProjects[project.project_id] && pdfData[project.project_id] && (
                            pdfData[project.project_id].length === 0 ? (
                              <tr className="pdf-row no-pdfs">
                                <td></td>
                                <td colSpan="5" className="no-pdfs-message">
                                  No documents uploaded yet. Click "Upload" to add a PDF, JPG, or PNG.
                                </td>
                              </tr>
                            ) : (
                              pdfData[project.project_id].map((pdf, pdfIndex) => (
                                <tr 
                                  key={`${project.project_id}-pdf-${pdfIndex}`}
                                  className="pdf-row clickable-pdf-row"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePdfClick(project.project_id, pdf);
                                  }}
                                >
                                  <td className="expand-cell"></td>
                                  <td className="pdf-cell">
                                    <span className="pdf-icon">{getDocumentIcon(pdf.filename)}</span>
                                    <div className="pdf-info">
                                      <span className="pdf-filename">{pdf.filename}</span>
                                    </div>
                                  </td>
                                  <td className="pdf-highlight-count">
                                    {pdf.highlights?.length || 0} highlight{(pdf.highlights?.length || 0) !== 1 ? 's' : ''}
                                  </td>
                                  <td className={`pdf-status pdf-status-${pdf.extraction_status}`}>
                                    {pdf.extraction_status === 'completed' ? '✅' : 
                                     pdf.extraction_status === 'processing' ? '⏳' : 
                                     pdf.extraction_status === 'failed' ? '❌' : '⏸️'}
                                    {' '}{pdf.extraction_status}
                                  </td>
                                  <td className="pdf-date">{formatShortDate(pdf.updated_at)}</td>
                                  <td className="pdf-actions">
                                    <button
                                      className="delete-pdf-button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePdf(pdf.pdf_id, project.project_id);
                                      }}
                                      title="Delete PDF"
                                    >
                                      🗑️
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}

        {/* Document Tab Content */}
        {activeTabType === 'document' && (
          <>
            {loading && !content && activeDocumentId && (
              <div className="loading-message">Loading document...</div>
            )}
            
            {/* Show document list/create UI when no document is active or when showDocumentList is true */}
            {(!activeDocumentId || showDocumentList) && (
              <div className="document-list-view">
            <div className="document-list-header-inline">
              <div className="document-list-title-section">
                <h3>Select or Create Document</h3>
                {propCurrentProjectName && (
                  <span className="current-project-badge">
                    <span className="project-badge-icon">📁</span>
                    {propCurrentProjectName}
                  </span>
                )}
              </div>
              {activeDocumentId && (
                <button
                  className="close-list-button"
                  onClick={() => setShowDocumentList(false)}
                >
                  × Close
                </button>
              )}
            </div>
            
            <div className="document-list-content-inline">
              {/* Create New Document */}
              <div className="create-document-section">
                <h4>Create New Document</h4>
                <div className="create-document-form">
                  <input
                    type="text"
                    placeholder="Document title (optional)"
                    value={newDocumentTitle}
                    onChange={(e) => setNewDocumentTitle(e.target.value)}
                    className="document-title-input"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && selectedProjectId) {
                        handleCreateNewDocument();
                      }
                    }}
                  />
                  <button
                    onClick={handleCreateNewDocument}
                    className="create-document-button"
                    disabled={!selectedProjectId}
                  >
                    Create New
                  </button>
                </div>
                {!selectedProjectId && (
                  <p className="project-warning">Please wait for project to load...</p>
                )}
              </div>

              {/* Existing Documents */}
              <div className="existing-documents-section">
                <div className="existing-documents-header">
                  <h4>Existing Documents</h4>
                  {!viewAllMode && (
                    <button
                      className="view-all-button"
                      onClick={handleViewAll}
                      disabled={loading}
                    >
                      View All
                    </button>
                  )}
                  {viewAllMode && (
                    <button
                      className="view-current-button"
                      onClick={handleViewCurrentProject}
                    >
                      View Current Project
                    </button>
                  )}
                </div>
                
                {!viewAllMode ? (
                  // Show current project documents
                  availableDocuments.length === 0 ? (
                    <div className="no-documents-section">
                      <p className="no-documents">No documents in this project.</p>
                    </div>
                  ) : (
                    <div className="document-list">
                      {availableDocuments.map((doc) => (
                        <div
                          key={doc.document_id}
                          className="document-list-item"
                          onClick={() => handleSelectExistingDocument(doc.document_id)}
                        >
                          <div className="document-list-item-title">{doc.title || 'Untitled'}</div>
                          <div className="document-list-item-date">
                            {doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  // Show all documents grouped by project
                  Object.keys(allDocumentsByProject).length === 0 ? (
                    <p className="no-documents">No documents found.</p>
                  ) : (
                    <div className="projects-document-list">
                      {Object.entries(allDocumentsByProject).map(([projectId, projectData]) => (
                        <div key={projectId} className="project-documents-group">
                          <div
                            className="project-header"
                            onClick={() => toggleProject(projectId)}
                          >
                            <span className={`project-expand-icon ${expandedProjects[projectId] ? 'expanded' : ''}`}>
                              ▶
                            </span>
                            <span className="project-name">{projectData.projectName}</span>
                            <span className="project-doc-count">({projectData.documents.length})</span>
                          </div>
                          {expandedProjects[projectId] && (
                            <div className="project-documents-list">
                              {projectData.documents.map((doc) => (
                                <div
                                  key={doc.document_id}
                                  className="document-list-item"
                                  onClick={() => handleSelectExistingDocument(doc.document_id)}
                                >
                                  <div className="document-list-item-title">{doc.title || 'Untitled'}</div>
                          <div className="document-list-item-date">
                            {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 
                             doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : ''}
                          </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
            )}
            {!loading && !error && activeDocumentId && !showDocumentList && (
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
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentPanel;
