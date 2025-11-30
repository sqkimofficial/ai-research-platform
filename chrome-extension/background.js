/**
 * Background service worker for AI Research Platform Highlights
 * Handles API communication and highlight queue management
 */

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
      tags: highlightData.tags || []
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }
  
  return await response.json();
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveHighlight') {
    handleSaveHighlight(message.data)
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

// Handle save highlight request
async function handleSaveHighlight(highlightData) {
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
  
  try {
    const response = await saveHighlightToAPI(highlightData, config);
    return {
      success: true,
      highlight_id: response.highlight_id,
      message: response.message
    };
  } catch (error) {
    console.error('Error saving highlight:', error);
    
    // Queue for later if network error
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      await queueHighlight(highlightData);
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

