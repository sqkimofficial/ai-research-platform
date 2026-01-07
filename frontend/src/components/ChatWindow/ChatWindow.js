import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { chatAPI, highlightsAPI, pdfAPI } from '../../services/api';
import { getSessionId, setSessionId } from '../../utils/auth';
import { markdownToHtml } from '../../utils/markdownConverter';
import MessageBubble from './MessageBubble';
import ProjectSelector from '../ProjectSelector/ProjectSelector';
import './ChatWindow.css';
import { ReactComponent as WriteIcon } from '../../assets/write-icon.svg';
import { ReactComponent as ResearchIcon } from '../../assets/research-icon.svg';
import { ReactComponent as CheckIcon } from '../../assets/check-icon.svg';
import { ReactComponent as FilterIcon } from '../../assets/filter-icon.svg';
import { ReactComponent as DropdownIcon } from '../../assets/dropdown-icon.svg';
import { ReactComponent as SendIcon } from '../../assets/send-icon.svg';
import { ReactComponent as WebIcon } from '../../assets/web-icon.svg';
import { ReactComponent as PdfIcon } from '../../assets/pdf-icon.svg';
import { ReactComponent as DeleteIcon } from '../../assets/delete-icon.svg';
import { ReactComponent as DocumentIcon } from '../../assets/document-icon.svg';
import { ReactComponent as AttachIcon } from '../../assets/attach-icon.svg';
import { ReactComponent as PlusIcon } from '../../assets/plus-icon.svg';
import { ReactComponent as ArrowSubIcon } from '../../assets/arrow-sub.svg';
import { ReactComponent as SearchIcon } from '../../assets/search.svg';
import { ReactComponent as CollapseIcon } from '../../assets/collapse-icon.svg';
import { ReactComponent as ChatIcon } from '../../assets/chat-icon.svg';
import highlightsImageIcon from '../../assets/highlights-image-icon.svg';
import highlightsPdfIcon from '../../assets/highlights-pdf-icon.svg';
import { documentAPI } from '../../services/api';

// Simple search - substring match only (same as DocumentPanel sources search)
const searchMatch = (query, text) => {
  if (!query) return true;
  return (text || '').toLowerCase().includes(query.toLowerCase());
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

// Globe icon (16px) for URL favicon fallback
const GlobeIconCard = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="globe-icon">
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
      d="M10 1.66699C12.0844 3.94863 13.269 6.91003 13.333 9.99999C13.269 13.09 12.0844 16.0514 10 18.333C7.91557 16.0514 6.73098 13.09 6.66699 9.99999C6.73098 6.91003 7.91557 3.94863 10 1.66699Z" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

const ChatWindow = ({ 
  sessionId: propSessionId, 
  isNewChat = false,
  selectedProjectId = null,
  onSessionCreated,
  onSwitchSession,  // New: callback to switch sessions
  activeDocumentId, 
  documentNameRefreshTrigger = 0,  // Trigger to refresh document name
  onAIMessage, 
  attachedSections = [], 
  attachedHighlights = [], 
  onClearAttachedHighlights,
  onRemoveAttachedHighlight,
  onInsertContentAtCursor,  // New: callback for cursor-aware insertion (Google Docs-like behavior)
  onActiveDocumentChange,  // New: callback to change active document
  onNavigateToSources,  // New: callback to navigate to sources tab and trigger upload
  isCollapsed = false,  // Whether chat is collapsed
  onToggleCollapse,  // Callback to toggle collapsed state
  viewContext = 'document'  // 'document' | 'allDocuments' | 'sources' - affects default state
}) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionIdState] = useState(null);
  const [currentAttachedSections, setCurrentAttachedSections] = useState([]);
  const [currentAttachedHighlights, setCurrentAttachedHighlights] = useState([]);
  const [editingContent, setEditingContent] = useState({}); // { pendingContentId: editedContent }
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null); // Store message while selecting project
  const [chatMode, setChatMode] = useState('write'); // 'write' | 'research'
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [commandsFilter, setCommandsFilter] = useState('all'); // commands | answers | all
  const [isCommandsMenuOpen, setIsCommandsMenuOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState('oldest'); // oldest | newest
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false); // Track if we're currently sending a message
  const [currentDocumentName, setCurrentDocumentName] = useState('');
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [isDocumentDropdownOpen, setIsDocumentDropdownOpen] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [currentChatTitle, setCurrentChatTitle] = useState('Untitled');
  const [isChatDropdownOpen, setIsChatDropdownOpen] = useState(false);
  
  // @ mention state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [urlHighlights, setUrlHighlights] = useState([]);
  const [pdfDocuments, setPdfDocuments] = useState([]);
  
  // Preview panel state
  const [previewImage, setPreviewImage] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // File attachment state
  const [pendingFiles, setPendingFiles] = useState([]); // Array of File objects
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const chatFileInputRef = useRef(null);
  
  const modeMenuRef = useRef(null);
  const commandsMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const messagesEndRef = useRef(null);
  const documentDropdownRef = useRef(null);
  const chatDropdownRef = useRef(null);
  const textareaRef = useRef(null);
  const mentionDropdownRef = useRef(null);
  const mentionContainerRef = useRef(null);
  
  // Update attached sections when prop changes
  useEffect(() => {
    if (attachedSections && attachedSections.length > 0) {
      setCurrentAttachedSections(attachedSections);
    }
  }, [attachedSections]);

  // Update attached highlights when prop changes
  useEffect(() => {
    if (attachedHighlights && attachedHighlights.length > 0) {
      setCurrentAttachedHighlights(prev => {
        // Merge new highlights, avoiding duplicates
        const newHighlights = [...prev];
        attachedHighlights.forEach(h => {
          if (!newHighlights.some(existing => existing.id === h.id)) {
            newHighlights.push(h);
          }
        });
        return newHighlights;
      });
    }
  }, [attachedHighlights]);

  useEffect(() => {
    // Don't initialize if we're currently sending a message - this prevents
    // overwriting the local message state when session is created mid-send
    if (!isSendingMessage) {
      initializeSession();
    }
  }, [propSessionId, isNewChat, isSendingMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch document name when activeDocumentId or documentNameRefreshTrigger changes
  useEffect(() => {
    const fetchDocumentName = async () => {
      if (activeDocumentId) {
        try {
          const response = await documentAPI.getDocument(activeDocumentId);
          const title = response.data.title || 'Untitled Document';
          setCurrentDocumentName(title);
        } catch (error) {
          console.error('Failed to fetch document:', error);
          setCurrentDocumentName('Untitled Document');
        }
      } else {
        setCurrentDocumentName('');
      }
    };
    fetchDocumentName();
  }, [activeDocumentId, documentNameRefreshTrigger]);

  // Fetch available documents for dropdown
  useEffect(() => {
    const fetchAvailableDocuments = async () => {
      if (selectedProjectId) {
        try {
          const response = await documentAPI.getAllResearchDocuments(selectedProjectId);
          setAvailableDocuments(response.data.documents || []);
        } catch (error) {
          console.error('Failed to fetch documents:', error);
          setAvailableDocuments([]);
        }
      }
    };
    fetchAvailableDocuments();
  }, [selectedProjectId, documentNameRefreshTrigger]);

  // Fetch chat sessions for dropdown
  useEffect(() => {
    const fetchChatSessions = async () => {
      if (selectedProjectId) {
        try {
          const response = await chatAPI.getAllSessions(selectedProjectId);
          setChatSessions(response.data.sessions || []);
        } catch (error) {
          console.error('Failed to fetch chat sessions:', error);
          setChatSessions([]);
        }
      }
    };
    fetchChatSessions();
  }, [selectedProjectId, sessionId]); // Reload when session changes to refresh list

  // Update chat title based on messages or session
  useEffect(() => {
    if (isNewChat || messages.length === 0) {
      setCurrentChatTitle('New Chat');
    } else if (sessionId) {
      // Find current session in the list to get its title
      const currentSession = chatSessions.find(s => s.session_id === sessionId);
      if (currentSession) {
        setCurrentChatTitle(currentSession.title || 'Untitled');
      } else if (messages.length > 0) {
        // Fallback: extract title from first user message (first 5 words)
        const firstUserMessage = messages.find(m => m.role === 'user');
        if (firstUserMessage) {
          // Extract only the first part before any attached sections/highlights markers
          const content = firstUserMessage.content.split('\n\n[Attached')[0];
          const words = content.split(' ').slice(0, 5);
          setCurrentChatTitle(words.join(' ') || 'Untitled');
        }
      }
    }
  }, [messages, sessionId, isNewChat, chatSessions]);

  // Refresh sessions after sending a message to update titles
  useEffect(() => {
    const refreshSessions = async () => {
      if (selectedProjectId && sessionId && messages.length > 0) {
        try {
          const response = await chatAPI.getAllSessions(selectedProjectId);
          setChatSessions(response.data.sessions || []);
        } catch (error) {
          console.error('Failed to refresh chat sessions:', error);
        }
      }
    };
    
    // Refresh sessions after messages change (with a small delay to allow backend to update)
    if (messages.length > 0) {
      const timeoutId = setTimeout(refreshSessions, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, selectedProjectId, sessionId]);

  // Fetch URL highlights and PDF documents for @ mention feature
  useEffect(() => {
    const fetchSourcesForMention = async () => {
      if (selectedProjectId) {
        try {
          // Fetch URL highlights (web sources)
          const highlightsResponse = await highlightsAPI.getHighlights(selectedProjectId);
          setUrlHighlights(highlightsResponse.data.highlights || []);
          
          // Fetch PDF documents
          const pdfsResponse = await pdfAPI.getPDFs(selectedProjectId);
          setPdfDocuments(pdfsResponse.data.pdfs || []);
        } catch (error) {
          console.error('Failed to fetch sources for mention:', error);
          setUrlHighlights([]);
          setPdfDocuments([]);
        }
      }
    };
    fetchSourcesForMention();
  }, [selectedProjectId]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 20 * 5; // 5 lines max (20px line-height)
      
      if (scrollHeight <= maxHeight) {
        textarea.style.height = `${scrollHeight}px`;
        textarea.style.overflowY = 'hidden';
      } else {
        textarea.style.height = `${maxHeight}px`;
        textarea.style.overflowY = 'auto';
      }
    }
  }, [inputMessage]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target)) {
        setIsModeMenuOpen(false);
      }
      if (commandsMenuRef.current && !commandsMenuRef.current.contains(event.target)) {
        setIsCommandsMenuOpen(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setIsSortMenuOpen(false);
      }
      if (documentDropdownRef.current && !documentDropdownRef.current.contains(event.target)) {
        setIsDocumentDropdownOpen(false);
      }
      if (chatDropdownRef.current && !chatDropdownRef.current.contains(event.target)) {
        setIsChatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract domain name from URL
  const extractDomain = useCallback((url) => {
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
  }, []);

  // Build mention dropdown items based on search query
  const mentionItems = useMemo(() => {
    const items = [];
    const query = mentionQuery.toLowerCase();
    
    // Process URL highlights (web sources)
    urlHighlights.forEach(urlDoc => {
      const sourceName = urlDoc.page_title || extractDomain(urlDoc.source_url);
      const sourceMatches = !query || searchMatch(query, sourceName) || searchMatch(query, urlDoc.source_url);
      
      // Check if source matches or any highlight matches
      const matchingHighlights = (urlDoc.highlights || []).filter(h => 
        searchMatch(query, h.text) || searchMatch(query, h.note || '')
      );
      
      if (sourceMatches || matchingHighlights.length > 0) {
        // Add source item
        items.push({
          type: 'source',
          sourceType: 'web',
          id: `web-${urlDoc.source_url}`,
          title: sourceName,
          sourceUrl: urlDoc.source_url,
          data: urlDoc,
          highlights: urlDoc.highlights || []
        });
        
        // Add highlight items under this source (either matching highlights or all if source matches)
        const highlightsToShow = query && !sourceMatches ? matchingHighlights : (urlDoc.highlights || []);
        highlightsToShow.forEach(highlight => {
          items.push({
            type: 'highlight',
            sourceType: 'web',
            id: `web-highlight-${highlight.highlight_id || highlight.text.substring(0, 20)}`,
            parentId: `web-${urlDoc.source_url}`,
            title: highlight.text,
            note: highlight.note,
            sourceTitle: sourceName,
            sourceUrl: urlDoc.source_url,
            data: highlight
          });
        });
      }
    });
    
    // Process PDF documents
    pdfDocuments.forEach(pdf => {
      const sourceName = pdf.filename;
      const sourceMatches = !query || searchMatch(query, sourceName);
      
      // Check if source matches or any highlight matches
      const matchingHighlights = (pdf.highlights || []).filter(h => 
        searchMatch(query, h.text) || searchMatch(query, h.note || '')
      );
      
      if (sourceMatches || matchingHighlights.length > 0) {
        // Add source item
        items.push({
          type: 'source',
          sourceType: 'pdf',
          id: `pdf-${pdf.pdf_id}`,
          title: sourceName,
          pdfId: pdf.pdf_id,
          data: pdf,
          highlights: pdf.highlights || []
        });
        
        // Add highlight items under this source
        const highlightsToShow = query && !sourceMatches ? matchingHighlights : (pdf.highlights || []);
        highlightsToShow.forEach(highlight => {
          items.push({
            type: 'highlight',
            sourceType: 'pdf',
            id: `pdf-highlight-${highlight.highlight_id || highlight.text.substring(0, 20)}`,
            parentId: `pdf-${pdf.pdf_id}`,
            title: highlight.text,
            note: highlight.note,
            sourceTitle: sourceName,
            pdfId: pdf.pdf_id,
            data: highlight
          });
        });
      }
    });
    
    return items;
  }, [mentionQuery, urlHighlights, pdfDocuments, extractDomain]);

  // Reset selected index when items change
  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionItems.length]);

  // Fetch preview when selection changes (for highlights with previews)
  useEffect(() => {
    const fetchPreview = async () => {
      if (!showMentionDropdown) {
        setPreviewImage(null);
        setPreviewLoading(false);
        return;
      }
      
      const selectedItem = mentionItems[mentionSelectedIndex];
      console.log('[PREVIEW] Selected item:', selectedItem?.type, selectedItem?.sourceType, selectedItem?.data?.highlight_id);
      
      // Fetch preview for PDF highlights - use preview_image_url (S3)
      if (selectedItem?.type === 'highlight' && selectedItem?.sourceType === 'pdf' && selectedItem?.pdfId) {
        console.log('[PREVIEW] PDF highlight - checking for preview_image_url');
        console.log('[PREVIEW] PDF highlight data keys:', selectedItem.data ? Object.keys(selectedItem.data) : 'no data');
        console.log('[PREVIEW] preview_image_url value:', selectedItem.data?.preview_image_url);
        
        // Check if preview_image_url is already in the data
        if (selectedItem.data?.preview_image_url) {
          console.log('[PREVIEW] Found preview_image_url in data:', selectedItem.data.preview_image_url);
          setPreviewImage(selectedItem.data.preview_image_url);
          setPreviewLoading(false);
        } else {
          // Try to fetch from API (for old highlights that might not have URL in data)
          console.log('[PREVIEW] No preview_image_url in data, fetching from API');
          setPreviewLoading(true);
          try {
            const response = await pdfAPI.getHighlightPreview(
              selectedItem.pdfId, 
              selectedItem.data.highlight_id
            );
            console.log('[PREVIEW] PDF preview API response:', response.data);
            if (response.data?.preview_image_url) {
              setPreviewImage(response.data.preview_image_url);
            } else {
              console.log('[PREVIEW] PDF preview: No preview_image_url in API response');
              setPreviewImage('placeholder');
            }
          } catch (error) {
            console.error('[PREVIEW] Failed to fetch PDF highlight preview:', error);
            setPreviewImage('placeholder');
          }
          setPreviewLoading(false);
        }
      } 
      // Fetch preview for web highlights - only use preview_image_url (S3)
      else if (selectedItem?.type === 'highlight' && selectedItem?.sourceType === 'web' && selectedItem?.sourceUrl && selectedProjectId) {
        console.log('[PREVIEW] Web highlight - checking for preview_image_url');
        console.log('[PREVIEW] Highlight data keys:', selectedItem.data ? Object.keys(selectedItem.data) : 'no data');
        console.log('[PREVIEW] preview_image_url value:', selectedItem.data?.preview_image_url);
        
        // Check if this highlight has a preview_image_url field (S3 URL)
        if (selectedItem.data?.preview_image_url) {
          // Preview URL is already in the data, use it directly
          console.log('[PREVIEW] Found preview_image_url:', selectedItem.data.preview_image_url);
          setPreviewImage(selectedItem.data.preview_image_url);
          setPreviewLoading(false);
        } else {
          // No preview available for this web highlight - show placeholder
          console.log('[PREVIEW] No preview_image_url found - showing placeholder');
          setPreviewImage('placeholder');
          setPreviewLoading(false);
        }
      } else if (selectedItem?.type === 'highlight') {
        console.log('[PREVIEW] Highlight but missing required data:', {
          sourceType: selectedItem?.sourceType,
          sourceUrl: selectedItem?.sourceUrl,
          selectedProjectId
        });
        setPreviewImage('placeholder');
        setPreviewLoading(false);
      } else {
        console.log('[PREVIEW] Not a highlight item, no preview needed');
        setPreviewImage(null);
        setPreviewLoading(false);
      }
    };
    
    fetchPreview();
  }, [mentionSelectedIndex, mentionItems, showMentionDropdown, selectedProjectId]);

  // Close mention dropdown when clicking outside
  useEffect(() => {
    const handleClickOutsideMention = (event) => {
      if (mentionDropdownRef.current && !mentionDropdownRef.current.contains(event.target) && 
          textareaRef.current && !textareaRef.current.contains(event.target)) {
        setShowMentionDropdown(false);
      }
    };
    if (showMentionDropdown) {
      document.addEventListener('mousedown', handleClickOutsideMention);
      return () => document.removeEventListener('mousedown', handleClickOutsideMention);
    }
  }, [showMentionDropdown]);

  // Position dropdown container using fixed positioning to escape parent overflow:hidden
  // Only reposition when dropdown opens, NOT when preview changes
  useEffect(() => {
    if (showMentionDropdown && mentionContainerRef.current && textareaRef.current) {
      const container = mentionContainerRef.current;
      const textareaRect = textareaRef.current.getBoundingClientRect();
      
      // Position above the textarea with 8px gap
      const dropdownGap = 8;
      
      // Set fixed position based on textarea location
      container.style.left = `${textareaRect.left}px`;
      container.style.bottom = `${window.innerHeight - textareaRect.top + dropdownGap}px`;
      
      // Force reflow to get accurate dropdown dimensions
      void container.offsetHeight;
      
      // Check if dropdown would overflow right edge (24px min margin)
      const viewportWidth = window.innerWidth;
      const containerRect = container.getBoundingClientRect();
      const minRightMargin = 24;
      const rightOverflow = containerRect.right - (viewportWidth - minRightMargin);
      
      if (rightOverflow > 0) {
        // Shift container left by the overflow amount
        container.style.left = `${textareaRect.left - rightOverflow}px`;
      }
    }
  }, [showMentionDropdown]); // Only run when dropdown opens/closes, NOT when preview changes

  // Handle selecting a mention item (source or highlight)
  const handleMentionSelect = useCallback((item) => {
    if (item.type === 'add-new') {
      // User wants to add a new source - trigger navigation to sources page with upload
      setShowMentionDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(null);
      
      // Remove the @query text from input
      if (mentionStartIndex !== null) {
        const beforeMention = inputMessage.substring(0, mentionStartIndex);
        const afterMention = inputMessage.substring(textareaRef.current?.selectionEnd || inputMessage.length);
        setInputMessage(beforeMention + afterMention);
      }
      
      // Navigate to sources and trigger upload
      if (onNavigateToSources) {
        onNavigateToSources();
      }
      return;
    }
    
    // Create highlight object to attach
    const highlightToAttach = {
      id: item.id,
      text: item.type === 'source' 
        ? `[Entire source: ${item.title}]` 
        : item.title,
      type: item.sourceType,
      sourceTitle: item.type === 'source' ? item.title : item.sourceTitle,
      source: item.sourceUrl || item.pdfId,
      note: item.note || '',
      colorTag: item.data?.color || 'default'
    };
    
    // Add to attached highlights
    setCurrentAttachedHighlights(prev => {
      if (prev.some(h => h.id === highlightToAttach.id)) return prev;
      return [...prev, highlightToAttach];
    });
    
    // Remove the @query text from input
    if (mentionStartIndex !== null) {
      const beforeMention = inputMessage.substring(0, mentionStartIndex);
      const afterMention = inputMessage.substring(textareaRef.current?.selectionEnd || inputMessage.length);
      setInputMessage(beforeMention + afterMention);
    }
    
    // Close dropdown
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(null);
    
    // Focus back on textarea
    textareaRef.current?.focus();
  }, [inputMessage, mentionStartIndex, onNavigateToSources]);

  // Handle input change for @ mention detection
  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    setInputMessage(value);
    
    // Check for @ mention trigger
    // Look backwards from cursor to find @
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = value[i];
      if (char === '@') {
        // Check if @ is at start or preceded by space/newline
        if (i === 0 || /\s/.test(value[i - 1])) {
          atIndex = i;
          break;
        }
      } else if (/\s/.test(char)) {
        // Hit whitespace before finding @, no mention
        break;
      }
    }
    
    if (atIndex !== -1) {
      // Extract the query after @
      const query = value.substring(atIndex + 1, cursorPos);
      // Only show if no space in query (closed mention)
      if (!query.includes(' ')) {
        setShowMentionDropdown(true);
        setMentionQuery(query);
        setMentionStartIndex(atIndex);
        return;
      }
    }
    
    // No active mention
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(null);
  }, []);

  // Handle keyboard navigation in mention dropdown
  const handleMentionKeyDown = useCallback((e) => {
    if (!showMentionDropdown) return false;
    
    const totalItems = mentionItems.length + 1; // +1 for "Add New Source"
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionSelectedIndex(prev => (prev + 1) % totalItems);
      return true;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
      return true;
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      // Select current item
      if (mentionSelectedIndex < mentionItems.length) {
        handleMentionSelect(mentionItems[mentionSelectedIndex]);
      } else {
        // "Add New Source" is selected
        handleMentionSelect({ type: 'add-new' });
      }
      return true;
    }
    
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowMentionDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(null);
      return true;
    }
    
    return false;
  }, [showMentionDropdown, mentionItems, mentionSelectedIndex, handleMentionSelect]);

  // File attachment handlers
  const addValidFiles = useCallback((files) => {
    const validFiles = files.filter(file => {
      const ext = file.name.toLowerCase();
      return ext.endsWith('.pdf') || ext.endsWith('.jpg') || 
             ext.endsWith('.jpeg') || ext.endsWith('.png');
    });
    if (validFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...validFiles]);
    }
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    addValidFiles(files);
    e.target.value = ''; // Reset input for re-selection
  }, [addValidFiles]);

  const removePendingFile = useCallback((index) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the container entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    
    const files = Array.from(e.dataTransfer.files || []);
    addValidFiles(files);
  }, [addValidFiles]);

  // Helper to truncate file names
  const truncateFileName = useCallback((fileName, maxLength = 20) => {
    if (!fileName) return 'Untitled';
    if (fileName.length <= maxLength) return fileName;
    const ext = fileName.lastIndexOf('.');
    if (ext > 0) {
      const name = fileName.substring(0, ext);
      const extension = fileName.substring(ext);
      const availableLength = maxLength - extension.length - 3; // 3 for "..."
      if (availableLength > 0) {
        return name.substring(0, availableLength) + '...' + extension;
      }
    }
    return fileName.substring(0, maxLength - 3) + '...';
  }, []);

  const initializeSession = async () => {
    // If it's a new chat, don't create session yet - wait for first message
    if (isNewChat) {
      setMessages([]);
      setSessionIdState(null);
      return;
    }
    
    try {
      // Use propSessionId if provided, otherwise check localStorage
      const sessionIdToUse = propSessionId || getSessionId();
      
      if (sessionIdToUse) {
        // Load existing session
        const response = await chatAPI.getSession(sessionIdToUse);
        setMessages(response.data.messages || []);
        setSessionIdState(sessionIdToUse);
        if (!propSessionId) {
          setSessionId(sessionIdToUse);
        }
      } else {
        // No session and not new chat mode - start new chat
        setMessages([]);
        setSessionIdState(null);
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setMessages([]);
      setSessionIdState(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage = inputMessage.trim();
    
    // If this is a new chat and no session exists, need to create one first
    if (isNewChat && !sessionId) {
      // If we have a selected project, create session with it
      if (selectedProjectId) {
        await createSessionAndSendMessage(selectedProjectId, userMessage);
      } else {
        // Show project selector
        setPendingMessage(userMessage);
        setShowProjectSelector(true);
      }
      return;
    }
    
    // If we have a session, send the message
    if (sessionId) {
      await sendMessageToSession(sessionId, userMessage);
    }
  };

  const handleKeyDown = (e) => {
    // First, check if mention dropdown should handle this key
    if (handleMentionKeyDown(e)) {
      return;
    }
    
    // If Enter is pressed without Shift, send the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
    // If Shift+Enter is pressed, allow default behavior (new line)
  };
  
  const createSessionAndSendMessage = async (projectId, userMessage) => {
    setInputMessage('');
    setLoading(true);
    setIsSendingMessage(true); // Mark that we're sending a message
    
    try {
      // Create the session first
      const sessionResponse = await chatAPI.createSession(projectId);
      const newSessionId = sessionResponse.data.session_id;
      
      setSessionId(newSessionId);
      setSessionIdState(newSessionId);
      
      // Notify parent about the new session
      if (onSessionCreated) {
        onSessionCreated(newSessionId);
      }
      
      // Now send the message
      await sendMessageToSession(newSessionId, userMessage);
    } catch (error) {
      console.error('Failed to create session:', error);
      setLoading(false);
      setIsSendingMessage(false);
      alert('Failed to create chat session. Please try again.');
    }
  };
  
  const handleProjectSelected = async (projectId, projectName) => {
    setShowProjectSelector(false);
    if (pendingMessage) {
      await createSessionAndSendMessage(projectId, pendingMessage);
      setPendingMessage(null);
    }
  };
  
  const sendMessageToSession = async (targetSessionId, userMessage) => {
    const attachedSectionsToSend = currentAttachedSections;
    const attachedHighlightsToSend = currentAttachedHighlights;
    const filesToUpload = [...pendingFiles];
    
    // Upload any pending files first
    if (filesToUpload.length > 0 && selectedProjectId) {
      setUploadingFiles(true);
      setPendingFiles([]); // Clear immediately for UX
      try {
        for (const file of filesToUpload) {
          await pdfAPI.uploadPDF(selectedProjectId, file);
        }
      } catch (err) {
        console.error('Failed to upload files:', err);
        // Show error but continue with message
      } finally {
        setUploadingFiles(false);
      }
    }
    
    // Prepare message content with attached sections and highlights
    let messageContent = userMessage;
    
    // Add file info to message context
    if (filesToUpload.length > 0) {
      const filesInfo = filesToUpload.map(f => f.name).join(', ');
      messageContent = `[New sources uploaded: ${filesInfo}]\n\n${messageContent}`;
    }
    
    // Add attached sections
    if (attachedSectionsToSend.length > 0) {
      const attachedMarkdown = attachedSectionsToSend
        .map(section => section.content || '')
        .filter(content => content.trim())
        .join('\n\n');
      
      if (attachedMarkdown) {
        messageContent = `${messageContent}\n\n[Attached sections from document:]\n\n${attachedMarkdown}`;
      }
    }
    
    // Add attached highlights
    if (attachedHighlightsToSend.length > 0) {
      const highlightsMarkdown = attachedHighlightsToSend.map(h => {
        let highlightText = `**Highlight:** "${h.text}"`;
        if (h.note) {
          highlightText += `\n**Note:** ${h.note}`;
        }
        if (h.source) {
          highlightText += `\n**Source:** ${h.sourceTitle || h.source}`;
        }
        if (h.colorTag) {
          highlightText += `\n**Color:** ${h.colorTag}`;
        }
        if (h.tags && h.tags.length > 0) {
          highlightText += `\n**Tags:** ${h.tags.join(', ')}`;
        }
        return highlightText;
      }).join('\n\n---\n\n');
      
      messageContent = `${messageContent}\n\n[Attached highlights:]\n\n${highlightsMarkdown}`;
    }
    
    setInputMessage('');
    setLoading(true);
    setIsSendingMessage(true); // Mark that we're sending a message
    setCurrentAttachedSections([]); // Clear attached sections after sending
    setCurrentAttachedHighlights([]); // Clear attached highlights after sending
    if (onClearAttachedHighlights) {
      onClearAttachedHighlights();
    }

    // Add user message to UI immediately (show raw markdown if sections/highlights attached)
    const newUserMessage = {
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      attachedSections: attachedSectionsToSend.length > 0 ? attachedSectionsToSend : undefined,
      attachedHighlights: attachedHighlightsToSend.length > 0 ? attachedHighlightsToSend : undefined
    };
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      // Combine sections and highlights for API call
      const allAttachments = [
        ...attachedSectionsToSend,
        ...attachedHighlightsToSend.map(h => ({
          type: 'highlight',
          content: `Highlight: "${h.text}"${h.note ? `\nNote: ${h.note}` : ''}${h.source ? `\nSource: ${h.sourceTitle || h.source}` : ''}`
        }))
      ];
      const response = await chatAPI.sendMessage(targetSessionId, userMessage, allAttachments, chatMode);
      // Extract message, document_content, sources, status, and pending_content_id from response
      const chatMessage = response.data.response || '';
      const documentContent = response.data.document_content || '';
      const sources = response.data.sources || [];
      const status = response.data.status;
      const pendingContentId = response.data.pending_content_id;
      
      const aiMessage = {
        role: 'assistant',
        content: chatMessage,
        sources: sources,
        document_content: documentContent,
        status: status,
        pending_content_id: pendingContentId,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      
      // Don't notify parent for pending content - only notify when approved
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setIsSendingMessage(false); // Clear the flag when done
    }
  };
  
  // Direct insertion at cursor position or end of document (no AI placement)
  // Uses Google Docs-like behavior: inserts at the last known cursor position
  // even if user clicked away from the document (e.g., into chat window)
  const handleApprove = async (pendingContentId, editedContent) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      // Find the message with this pending content to get the content
      const pendingMessage = messages.find(msg => msg.pending_content_id === pendingContentId);
      const contentToInsert = editedContent || pendingMessage?.document_content || '';
      
      if (!contentToInsert) {
        alert('No content to insert.');
        setLoading(false);
        return;
      }
      
      // Convert markdown to HTML for the TipTap editor
      const htmlContent = markdownToHtml(contentToInsert);
      
      // Use client-side insertion at cursor position (Google Docs-like behavior)
      // This inserts at the saved cursor position, or at end if no position saved
      if (onInsertContentAtCursor) {
        const inserted = onInsertContentAtCursor(htmlContent);
        
        if (inserted) {
          // Client-side insertion successful - now clear pending content on backend
          try {
            await chatAPI.clearPendingContent(sessionId, pendingContentId);
          } catch (clearError) {
            // Log but don't fail - the content is already inserted
            console.warn('Failed to clear pending content on backend:', clearError);
          }
          
          // Update message status (keep document_content so it can be shown when expanded)
          setMessages((prev) => prev.map(msg => 
            msg.pending_content_id === pendingContentId
              ? { ...msg, status: 'approved' }
              : msg
          ));
          
          // Clear editing state
          setEditingContent((prev) => {
            const newState = { ...prev };
            delete newState[pendingContentId];
            return newState;
          });
          
          // Note: We don't call onAIMessage here because auto-save will handle
          // syncing the document to backend, so no need to trigger a refresh
        } else {
          // Client-side insertion failed - fall back to backend insertion
          console.warn('Client-side insertion failed, falling back to backend');
          await fallbackToBackendInsertion(pendingContentId, editedContent);
        }
      } else {
        // No client-side insertion available - use backend
        await fallbackToBackendInsertion(pendingContentId, editedContent);
      }
      
    } catch (error) {
      console.error('Failed to insert content:', error);
      alert('Failed to insert content. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Fallback to backend insertion (appends to end of document)
  const fallbackToBackendInsertion = async (pendingContentId, editedContent) => {
    await chatAPI.directInsertContent(sessionId, pendingContentId, editedContent, activeDocumentId);
    
    // Update message status (keep document_content so it can be shown when expanded)
    setMessages((prev) => prev.map(msg => 
      msg.pending_content_id === pendingContentId
        ? { ...msg, status: 'approved' }
        : msg
    ));
    
    // Clear editing state
    setEditingContent((prev) => {
      const newState = { ...prev };
      delete newState[pendingContentId];
      return newState;
    });
    
    // Notify parent to refresh document
    if (onAIMessage) {
      onAIMessage('approved');
    }
  };

  const handleEdit = (pendingContentId, editedContent) => {
    setEditingContent((prev) => ({
      ...prev,
      [pendingContentId]: editedContent
    }));
  };

  // Build conversation pairs to keep user + assistant responses together
  const pairs = [];
  let currentPair = null;
  messages.forEach((message, index) => {
    if (message.role === 'user') {
      if (currentPair) {
        pairs.push(currentPair);
      }
      currentPair = {
        userMessage: message,
        userIndex: index,
        assistantMessages: []
      };
    } else if (currentPair) {
      currentPair.assistantMessages.push({ message, index });
    } else {
      // Orphan assistant message (edge case)
      pairs.push({
        userMessage: null,
        userIndex: null,
        assistantMessages: [{ message, index }]
      });
    }
  });
  if (currentPair) {
    pairs.push(currentPair);
  }

  // Sort pairs by the user message index (or first assistant index for orphans)
  const sortedPairs = [...pairs].sort((a, b) => {
    const aIdx = a.userIndex !== null ? a.userIndex : (a.assistantMessages[0]?.index ?? 0);
    const bIdx = b.userIndex !== null ? b.userIndex : (b.assistantMessages[0]?.index ?? 0);
    if (sortOrder === 'oldest') return aIdx - bIdx;
    return bIdx - aIdx;
  });

  // Count rendered messages for empty-state check
  const renderedMessageCount = sortedPairs.reduce((count, pair) => {
    if (commandsFilter !== 'answers' && pair.userMessage) count += 1;
    if (commandsFilter !== 'commands') count += pair.assistantMessages.length;
    return count;
  }, 0);

  const handleNewChat = () => {
    if (onSwitchSession) {
      onSwitchSession(null);
    }
    setIsChatDropdownOpen(false);
  };

  const handleSessionSelect = (sessionId) => {
    if (onSwitchSession) {
      onSwitchSession(sessionId);
    }
    setIsChatDropdownOpen(false);
  };

  // Determine if we're in empty state
  const isEmptyState = renderedMessageCount === 0;

  // Chat input component (reusable)
  const chatInputArea = (
    <div className="chat-input-area">
        <div 
          className={`chat-input-container ${isDraggingOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Hidden file input */}
          <input
            type="file"
            ref={chatFileInputRef}
            onChange={handleFileSelect}
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            style={{ display: 'none' }}
          />
          
          {/* Drag overlay - shown when dragging files over */}
          {isDraggingOver && (
            <div className="chat-drag-overlay">
              <div className="chat-drag-overlay-content">
                <AttachIcon className="chat-drag-overlay-icon" />
                <span>Drop PDF or image to attach</span>
              </div>
            </div>
          )}
          
          {/* Top Section: Document Selector and Bookmark */}
          <div className="chat-input-top-section">
            <div className="document-selector-wrapper" ref={documentDropdownRef}>
              <button
                type="button"
                className="document-selector"
                onClick={() => setIsDocumentDropdownOpen((prev) => !prev)}
                aria-expanded={isDocumentDropdownOpen}
                aria-haspopup="true"
              >
                <DocumentIcon className="document-selector-icon" />
                <span className="document-selector-name">
                  {currentDocumentName || 'No document selected'}
                </span>
                <DropdownIcon className="document-selector-caret" />
              </button>
              {isDocumentDropdownOpen && availableDocuments.length > 0 && (
                <div className="document-dropdown">
                  {availableDocuments.map((doc) => (
                    <button
                      key={doc.document_id}
                      type="button"
                      className={`document-dropdown-item ${doc.document_id === activeDocumentId ? 'active' : ''}`}
                      onClick={() => {
                        if (onActiveDocumentChange) {
                          onActiveDocumentChange(doc.document_id);
                        }
                        setIsDocumentDropdownOpen(false);
                      }}
                    >
                      <span>{doc.title || 'Untitled Document'}</span>
                      {doc.document_id === activeDocumentId && <CheckIcon className="document-check-icon" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="attach-button"
              onClick={() => chatFileInputRef.current?.click()}
              disabled={uploadingFiles}
              aria-label="Attach file"
              title="Attach PDF or image"
            >
              <AttachIcon className="attach-button-icon" />
            </button>
          </div>

          {/* Middle Section: Input Area */}
          <div className="chat-input-middle-section">
          {(currentAttachedSections.length > 0 || currentAttachedHighlights.length > 0 || pendingFiles.length > 0) && (
            <div className="attached-items-container">
              {/* Pending file attachments */}
              {pendingFiles.length > 0 && (
                <div className="attached-files-indicator">
                  {pendingFiles.map((file, idx) => (
                    <div key={idx} className="attached-file-chip">
                      {file.name.toLowerCase().endsWith('.pdf') ? 
                        <PdfIcon className="file-type-icon" /> : 
                        <img src={highlightsImageIcon} alt="Image" className="file-type-icon" />}
                      <span className="file-name">{truncateFileName(file.name)}</span>
                      <button 
                        className="remove-file-button"
                        onClick={() => removePendingFile(idx)}
                        title="Remove file"
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {currentAttachedSections.length > 0 && (
                <div className="attached-sections-indicator">
                  <span className="attached-icon">📄</span>
                  <span className="attached-count">{currentAttachedSections.length} section{currentAttachedSections.length !== 1 ? 's' : ''}</span>
                  <button
                    className="clear-attached-button"
                    onClick={() => setCurrentAttachedSections([])}
                    title="Clear attached sections"
                  >
                    ×
                  </button>
                </div>
              )}
              {currentAttachedHighlights.length > 0 && (
                <div className="attached-highlights-indicator">
                  <div className="attached-highlights-list">
                    {currentAttachedHighlights.map((h, idx) => {
                      const getSourceName = () => {
                        if (h.type === 'web') {
                          return h.sourceTitle || 'Web Page';
                        } else if (h.type === 'pdf') {
                          return h.source || 'PDF Document';
                        }
                        return 'Document';
                      };

                      const getSourceIcon = () => {
                        if (h.type === 'web') {
                          return <WebIcon className="source-type-icon" />;
                        } else if (h.type === 'pdf') {
                          return <PdfIcon className="source-type-icon" />;
                        }
                        return null;
                      };

                      const truncateText = (text, maxLength = 30) => {
                        if (!text) return '';
                        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
                      };

                      const truncateFileName = (fileName, maxLength = 25) => {
                        if (!fileName) return 'Untitled';
                        return fileName.length > maxLength ? fileName.substring(0, maxLength) + '...' : fileName;
                      };

                      return (
                        <div key={h.id || idx} className="attached-highlight-chip">
                          {getSourceIcon()}
                          <span className="source-file-name">{truncateFileName(getSourceName())}</span>
                          <span className="source-separator">|</span>
                          <span className="highlight-preview">{truncateText(h.text)}</span>
                          <button
                            className="remove-highlight-button"
                            onClick={() => {
                              setCurrentAttachedHighlights(prev => prev.filter(item => item.id !== h.id));
                              if (onRemoveAttachedHighlight) {
                                onRemoveAttachedHighlight(h.id);
                              }
                            }}
                            title="Remove this highlight"
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
            <div className="chat-input-wrapper">
              <textarea
                ref={textareaRef}
                className="chat-input"
                value={inputMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask Anything..."
                disabled={loading}
                rows={1}
              />
              
              {/* @ Mention Dropdown with Preview Panel */}
              {showMentionDropdown && (
                <div className="mention-dropdown-container" ref={mentionContainerRef}>
                  <div className="mention-dropdown" ref={mentionDropdownRef}>
                    {/* Preview Panel - positioned to LEFT of dropdown via CSS */}
                    {(previewImage || previewLoading) && (
                      <div className="mention-preview-panel">
                        {previewLoading ? (
                          <div className="preview-loading">
                            <div className="preview-loading-spinner"></div>
                            <span>Loading preview...</span>
                          </div>
                        ) : previewImage === 'placeholder' ? (
                          <div className="preview-placeholder">
                            <div className="preview-placeholder-icon">🖼️</div>
                            <span>No preview available</span>
                          </div>
                        ) : (
                          <img 
                            src={previewImage.startsWith('http') ? previewImage : `data:image/jpeg;base64,${previewImage}`} 
                            alt="Highlight context preview"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              console.error('[PREVIEW] Image failed to load:', e.target.src);
                              console.error('[PREVIEW] This is likely a CORS issue. Check S3 bucket CORS configuration.');
                            }}
                          />
                        )}
                      </div>
                    )}
                    
                    {/* Dropdown items */}
                    <div className="mention-dropdown-items">
                      {mentionItems.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`mention-item ${item.type === 'highlight' ? 'mention-item-highlight' : 'mention-item-source'} ${index === mentionSelectedIndex ? 'selected' : ''}`}
                          onClick={() => handleMentionSelect(item)}
                          onMouseEnter={() => setMentionSelectedIndex(index)}
                        >
                          {item.type === 'source' ? (
                            <>
                              {item.sourceType === 'web' ? (
                                // Use favicon for web sources (same as sources table)
                                <div className="mention-item-icon">
                                  {getFaviconUrl(item.sourceUrl) ? (
                                    <img 
                                      src={getFaviconUrl(item.sourceUrl)} 
                                      alt={item.title}
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <GlobeIconCard />
                                  )}
                                </div>
                              ) : (
                                // Use PDF/image icon for PDFs (same as sources table)
                                <div className="mention-item-icon">
                                  {(() => {
                                    const isImage = item.data?.content_type && (
                                      item.data.content_type.startsWith('image/') || 
                                      item.data.content_type === 'image/jpeg' || 
                                      item.data.content_type === 'image/png' || 
                                      item.data.content_type === 'image/jpg'
                                    );
                                    return (
                                      <img 
                                        src={isImage ? highlightsImageIcon : highlightsPdfIcon} 
                                        alt={isImage ? 'Image' : 'PDF'}
                                      />
                                    );
                                  })()}
                                </div>
                              )}
                              <span className="mention-item-title">{item.title}</span>
                            </>
                          ) : (
                            <>
                              <ArrowSubIcon className="mention-item-icon mention-sub-icon" />
                              <span className="mention-item-title">{item.title.length > 50 ? item.title.substring(0, 50) + '...' : item.title}</span>
                            </>
                          )}
                        </button>
                      ))}
                      
                      {/* Add New Source option */}
                      <button
                        type="button"
                        className={`mention-item mention-item-add-new ${mentionSelectedIndex === mentionItems.length ? 'selected' : ''}`}
                        onClick={() => handleMentionSelect({ type: 'add-new' })}
                        onMouseEnter={() => setMentionSelectedIndex(mentionItems.length)}
                      >
                        <PlusIcon className="mention-item-icon" />
                        <span className="mention-item-title">Add New Source</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Section: Mode Dropdown and Send Button */}
          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <div className="chat-input-bottom-section">
              <div className="mode-dropdown" ref={modeMenuRef}>
                <button
                  type="button"
                  className={`mode-toggle ${isModeMenuOpen ? 'open' : ''}`}
                  onClick={() => setIsModeMenuOpen((prev) => !prev)}
                  aria-expanded={isModeMenuOpen}
                  aria-haspopup="true"
                >
                  {chatMode === 'write' ? (
                    <WriteIcon className="mode-toggle-icon" />
                  ) : (
                    <ResearchIcon className="mode-toggle-icon" />
                  )}
                  <span>{chatMode === 'write' ? 'Write' : 'Research'}</span>
                  <DropdownIcon className="caret-icon" />
                </button>
                {isModeMenuOpen && (
                  <div className="mode-menu">
                    <button
                      type="button"
                      className={`mode-option ${chatMode === 'write' ? 'active' : ''}`}
                      onClick={() => {
                        setChatMode('write');
                        setIsModeMenuOpen(false);
                      }}
                    >
                      <div className="mode-option-left">
                        <WriteIcon className="mode-option-icon" />
                        <span className="mode-option-label">Write</span>
                      </div>
                      {chatMode === 'write' && <CheckIcon className="mode-check-icon" />}
                    </button>
                    <button
                      type="button"
                      className={`mode-option ${chatMode === 'research' ? 'active' : ''}`}
                      onClick={() => {
                        setChatMode('research');
                        setIsModeMenuOpen(false);
                      }}
                    >
                      <div className="mode-option-left">
                        <ResearchIcon className="mode-option-icon" />
                        <span className="mode-option-label">Research</span>
                      </div>
                      {chatMode === 'research' && <CheckIcon className="mode-check-icon" />}
                    </button>
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="send-button"
                disabled={loading || !inputMessage.trim()}
              >
                <SendIcon className="send-icon" />
              </button>
            </div>
          </form>
        </div>
      </div>
  );

  // Render collapsed state - floating button
  if (isCollapsed) {
    return (
      <button 
        className="chat-collapsed-button"
        onClick={onToggleCollapse}
        aria-label="Open chat"
      >
        <ChatIcon className="chat-collapsed-icon" />
      </button>
    );
  }

  return (
    <div className="chat-window">
      {/* Chat Header - Always visible with dropdown, filter, and add button */}
      <div className="chat-header">
        <div className="chat-header-top">
          <div className="chat-session-dropdown-wrapper" ref={chatDropdownRef}>
            <button
              type="button"
              className="chat-session-selector"
              onClick={() => setIsChatDropdownOpen((prev) => !prev)}
              aria-expanded={isChatDropdownOpen}
              aria-haspopup="true"
            >
              <span className="chat-session-title">{currentChatTitle}</span>
              <DropdownIcon className="chat-session-caret" />
            </button>
            {isChatDropdownOpen && (
              <div className="chat-session-dropdown">
                <button
                  type="button"
                  className="chat-session-new-button"
                  onClick={handleNewChat}
                >
                  <PlusIcon className="chat-session-new-icon" />
                  <span>New Chat</span>
                </button>
                {chatSessions.length > 0 && (
                  <div className="chat-session-list">
                    {chatSessions.map((session) => (
                      <button
                        key={session.session_id}
                        type="button"
                        className={`chat-session-item ${sessionId === session.session_id && !isNewChat ? 'active' : ''}`}
                        onClick={() => handleSessionSelect(session.session_id)}
                      >
                        <span>{session.title || 'Untitled Chat'}</span>
                        {sessionId === session.session_id && !isNewChat && (
                          <CheckIcon className="chat-session-check-icon" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className="search-button"
              aria-label="Search chat"
              onClick={() => {/* Dummy button - functionality to be added later */}}
            >
              <SearchIcon className="search-icon" />
            </button>
            <button
              type="button"
              className={`filter-button ${isFilterActive ? 'active' : ''}`}
              aria-label="Filter questions"
              aria-pressed={isFilterActive}
              onClick={() => setIsFilterActive((prev) => !prev)}
            >
              <FilterIcon className="filter-icon" />
            </button>
            <div className="header-separator-dot" />
            <button
              type="button"
              className="add-chat-button"
              aria-label="New Chat"
              onClick={handleNewChat}
            >
              <PlusIcon className="add-chat-icon" />
            </button>
            <div className="header-separator-dot" />
            <button
              type="button"
              className="collapse-button"
              aria-label={isCollapsed ? "Expand chat" : "Collapse chat"}
              onClick={onToggleCollapse}
            >
              <CollapseIcon className="collapse-icon" />
            </button>
          </div>
          {isFilterActive && (
            <div className="filter-dropdown">
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Search previous commands"
                  className="filter-search-input"
                />
                <div className="filter-actions">
                  <div className="filter-actions-right">
                    <div className="sort-menu-wrapper" ref={sortMenuRef}>
                      <button
                        type="button"
                        className="filter-chip with-caret"
                        onClick={() => setIsSortMenuOpen((prev) => !prev)}
                        aria-haspopup="true"
                        aria-expanded={isSortMenuOpen}
                      >
                        <span>Sort by : {sortOrder === 'oldest' ? 'Oldest' : 'Newest'}</span>
                        <DropdownIcon className="caret-icon" />
                      </button>
                      {isSortMenuOpen && (
                        <div className="sort-dropdown">
                          <button
                            type="button"
                            className={`commands-item ${sortOrder === 'oldest' ? 'active' : ''}`}
                            onClick={() => {
                              setSortOrder('oldest');
                              setIsSortMenuOpen(false);
                            }}
                          >
                            <span>Oldest</span>
                            {sortOrder === 'oldest' && <CheckIcon className="check-icon" />}
                          </button>
                          <button
                            type="button"
                            className={`commands-item ${sortOrder === 'newest' ? 'active' : ''}`}
                            onClick={() => {
                              setSortOrder('newest');
                              setIsSortMenuOpen(false);
                            }}
                          >
                            <span>Newest</span>
                            {sortOrder === 'newest' && <CheckIcon className="check-icon" />}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="commands-menu-wrapper" ref={commandsMenuRef}>
                      <button
                        type="button"
                        className="filter-chip with-caret"
                        onClick={() => setIsCommandsMenuOpen((prev) => !prev)}
                        aria-haspopup="true"
                        aria-expanded={isCommandsMenuOpen}
                      >
                        <span>Commands</span>
                        <DropdownIcon className="caret-icon" />
                      </button>
                      {isCommandsMenuOpen && (
                        <div className="commands-dropdown">
                          <button
                            type="button"
                            className={`commands-item ${commandsFilter === 'commands' ? 'active' : ''}`}
                            onClick={() => {
                              setCommandsFilter('commands');
                              setIsCommandsMenuOpen(false);
                            }}
                          >
                            <span>Commands</span>
                            {commandsFilter === 'commands' && <CheckIcon className="check-icon" />}
                          </button>
                          <button
                            type="button"
                            className={`commands-item ${commandsFilter === 'answers' ? 'active' : ''}`}
                            onClick={() => {
                              setCommandsFilter('answers');
                              setIsCommandsMenuOpen(false);
                            }}
                          >
                            <span>Answers</span>
                            {commandsFilter === 'answers' && <CheckIcon className="check-icon" />}
                          </button>
                          <button
                            type="button"
                            className={`commands-item ${commandsFilter === 'all' ? 'active' : ''}`}
                            onClick={() => {
                              setCommandsFilter('all');
                              setIsCommandsMenuOpen(false);
                            }}
                          >
                            <span>All</span>
                            {commandsFilter === 'all' && <CheckIcon className="check-icon" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      
      {/* Chat input at top for empty state */}
      {isEmptyState && chatInputArea}
      
      <div className="chat-messages">
        {sortedPairs.map((pair, pairIndex) => (
            <div key={pairIndex} className="conversation-pair">
              {pair.userMessage && commandsFilter !== 'answers' && (
                <div className="user-prompt-sticky">
                  <MessageBubble 
                    message={pair.userMessage}
                    onApprove={handleApprove}
                    onEdit={handleEdit}
                    editedContent={editingContent[pair.userMessage.pending_content_id]}
                    mode={chatMode}
                  />
                </div>
              )}
              <div className="assistant-responses">
                {commandsFilter !== 'commands' &&
                  pair.assistantMessages.map(({ message, index }) => (
                    <MessageBubble 
                      key={index} 
                      message={message}
                      onApprove={handleApprove}
                      onEdit={handleEdit}
                      editedContent={editingContent[message.pending_content_id]}
                      mode={chatMode}
                    />
                  ))}
              </div>
            </div>
          ))}
        {loading && (
          <div className="loading-indicator">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat input at bottom for non-empty state */}
      {!isEmptyState && chatInputArea}
      
      {showProjectSelector && (
        <ProjectSelector
          onSelectProject={handleProjectSelected}
          onClose={() => {
            setShowProjectSelector(false);
            setPendingMessage(null);
          }}
        />
      )}
    </div>
  );
};

export default ChatWindow;


