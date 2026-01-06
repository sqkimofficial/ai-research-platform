/**
 * Background service worker for AI Research Platform Highlights
 * Handles API communication, highlight queue management, and OAuth authentication
 */

// Import auth utilities
importScripts('auth.js');

// Default configuration
const DEFAULT_CONFIG = {
  apiUrl: 'http://localhost:5001',
  token: null,
  projectId: null
};

// Queue for offline highlights
let highlightQueue = [];

// Get current configuration
async function getConfig() {
  const result = await chrome.storage.local.get(['apiUrl', 'token', 'projectId']);
  return {
    apiUrl: result.apiUrl || DEFAULT_CONFIG.apiUrl,
    token: result.token || DEFAULT_CONFIG.token,
    projectId: result.projectId || DEFAULT_CONFIG.projectId
  };
}

// Save configuration
async function saveConfig(config) {
  await chrome.storage.local.set(config);
}

// Load queued highlights from storage
async function loadQueue() {
  const result = await chrome.storage.local.get(['highlightQueue']);
  highlightQueue = result.highlightQueue || [];
}

// Save queue to storage
async function saveQueue() {
  await chrome.storage.local.set({ highlightQueue });
}

// Add highlight to queue
async function queueHighlight(highlightData) {
  await loadQueue();
  highlightQueue.push({
    ...highlightData,
    queuedAt: new Date().toISOString()
  });
  await saveQueue();
}

// Process queued highlights
async function processQueue() {
  await loadQueue();
  
  if (highlightQueue.length === 0) return;
  
  const config = await getConfig();
  if (!config.token || !config.projectId) {
    console.log('Cannot process queue: missing configuration');
    return;
  }
  
  const processed = [];
  
  for (const highlight of highlightQueue) {
    try {
      const response = await saveHighlightToAPI(highlight, config);
      if (response.success) {
        processed.push(highlight);
      }
    } catch (error) {
      console.error('Failed to process queued highlight:', error);
      // Stop processing on error - will retry later
      break;
    }
  }
  
  // Remove processed highlights from queue
  if (processed.length > 0) {
    highlightQueue = highlightQueue.filter(h => !processed.includes(h));
    await saveQueue();
    console.log(`Processed ${processed.length} queued highlights`);
  }
}

// Save highlight to API
async function saveHighlightToAPI(highlightData, config) {
  const { apiUrl, token, projectId } = config;
  
  const response = await fetch(`${apiUrl}/api/highlights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      project_id: projectId,
      source_url: highlightData.source_url,
      page_title: highlightData.page_title,
      text: highlightData.text,
      note: highlightData.note || null,
      tags: highlightData.tags || [],
      // NEW: Include preview data for screenshot cropping on backend
      preview_data: highlightData.preview_data || null
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }
  
  return await response.json();
}

// Handle Google OAuth authentication
async function handleGoogleAuth() {
  try {
    const accessToken = await initiateGoogleAuth();
    
    // Sync user to backend
    const config = await getConfig();
    const apiUrl = config.apiUrl || 'http://localhost:5001';
    
    const syncResponse = await fetch(`${apiUrl}/api/auth/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!syncResponse.ok) {
      const error = await syncResponse.json();
      throw new Error(error.error || 'Failed to sync user');
    }
    
    // Save token
    await saveConfig({ token: accessToken });
    
    return {
      success: true,
      token: accessToken
    };
  } catch (error) {
    console.error('Google auth error:', error);
    return {
      success: false,
      error: error.message || 'Authentication failed'
    };
  }
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle Google OAuth request
  if (message.action === 'googleAuth') {
    handleGoogleAuth()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.action === 'saveHighlight') {
    // Pass sender.tab.id for screenshot capture
    const tabId = sender.tab ? sender.tab.id : null;
    handleSaveHighlight(message.data, tabId)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.action === 'getConfig') {
    getConfig().then(sendResponse);
    return true;
  }
  
  if (message.action === 'saveConfig') {
    saveConfig(message.config)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'getQueueStatus') {
    loadQueue().then(() => {
      sendResponse({ queueLength: highlightQueue.length });
    });
    return true;
  }
  
  if (message.action === 'processQueue') {
    processQueue()
      .then(() => loadQueue())
      .then(() => sendResponse({ success: true, queueLength: highlightQueue.length }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Capture and crop screenshot centered on selection
async function captureHighlightPreview(tabId, selectionRect) {
  if (!selectionRect) {
    console.log('No selection rect provided, skipping screenshot');
    return null;
  }
  
  try {
    console.log('Attempting to capture screenshot for tab:', tabId);
    console.log('Selection rect:', selectionRect);
    console.log('Viewport dimensions:', selectionRect.viewport_width, 'x', selectionRect.viewport_height);
    
    // Capture visible tab as PNG
    // Note: This requires <all_urls> host permission or activeTab permission
    // captureVisibleTab captures the full visible viewport of the active tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    if (!dataUrl) {
      console.error('captureVisibleTab returned empty result');
      return null;
    }
    
    // Decode to get image dimensions for verification
    try {
      const base64Data = dataUrl.split(',')[1];
      const imgBytes = atob(base64Data);
      // PNG header is 8 bytes, then IHDR chunk with width/height (4 bytes each, big-endian)
      // For quick check, we can decode a small portion
      console.log('Screenshot captured successfully, data URL length:', dataUrl.length);
      console.log('Base64 data length:', base64Data.length);
    } catch (e) {
      console.log('Could not decode screenshot dimensions (non-critical):', e);
    }
    
    // Extract base64 from data URL
    const base64Data = dataUrl.split(',')[1];
    
    if (!base64Data) {
      console.error('Failed to extract base64 data from screenshot');
      return null;
    }
    
    // Return both the screenshot and selection info for backend cropping
    // The backend will verify dimensions match viewport
    return {
      screenshot: base64Data,
      selection_rect: selectionRect
    };
  } catch (error) {
    console.error('Failed to capture screenshot:', error.message || error);
    // Common errors:
    // - "Cannot access contents of url" - missing host permission
    // - "No active tab" - tab focus issue
    // - "Cannot capture a protected page" - chrome:// pages
    return null;
  }
}

// Handle save highlight request
async function handleSaveHighlight(highlightData, senderTabId) {
  const config = await getConfig();
  
  // Check if configured
  if (!config.token) {
    return { 
      success: false, 
      error: 'Not authenticated. Please configure the extension first.' 
    };
  }
  
  if (!config.projectId) {
    return { 
      success: false, 
      error: 'No project selected. Please configure the extension.' 
    };
  }
  
  // Capture screenshot preview
  let previewData = null;
  if (highlightData.selection_rect) {
    try {
      previewData = await captureHighlightPreview(senderTabId, highlightData.selection_rect);
    } catch (error) {
      console.error('Failed to capture preview:', error);
      // Continue without preview - it's optional
    }
  }
  
  // Add preview data to highlight data
  const dataWithPreview = {
    ...highlightData,
    preview_data: previewData
  };
  
  try {
    const response = await saveHighlightToAPI(dataWithPreview, config);
    return {
      success: true,
      highlight_id: response.highlight_id,
      message: response.message
    };
  } catch (error) {
    console.error('Error saving highlight:', error);
    
    // Queue for later if network error
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      await queueHighlight(dataWithPreview);
      return {
        success: false,
        queued: true,
        error: 'Network error. Highlight queued for later.'
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Try to process queue periodically
chrome.alarms.create('processQueue', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'processQueue') {
    processQueue();
  }
});

// Process queue on startup
chrome.runtime.onStartup.addListener(() => {
  processQueue();
});

// Initialize
loadQueue();

