/**
 * Content script for AI Research Platform Highlights
 * Detects text selection and shows highlight popup with note input
 */

// Create highlight popup element
let highlightPopup = null;
let selectedText = '';
let selectionTimeout = null;
let extensionEnabled = true; // Default to enabled

// Initialize the highlight popup
function createHighlightPopup() {
  if (highlightPopup) return;
  
  highlightPopup = document.createElement('div');
  highlightPopup.id = 'ai-research-highlight-popup';
  highlightPopup.innerHTML = `
    <div class="popup-header">
      <div class="popup-title-wrapper">
        <img src="${chrome.runtime.getURL('assets/highlight-popup-icon.svg')}" alt="" class="popup-icon" />
        <span class="popup-title">Save Highlight</span>
      </div>
      <button class="popup-close" title="Cancel">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    <div class="popup-content">
      <p class="popup-project-label">Saving highlight to <span class="project-name-text"></span></p>
      <div class="popup-preview">
        <p class="preview-label">Selected text</p>
        <p class="preview-text"></p>
      </div>
      <div class="popup-note">
        <label for="highlight-note">Add a note (optional)</label>
        <textarea id="highlight-note" placeholder=""></textarea>
      </div>
      <button class="btn-save">
        Save
      </button>
    </div>
  `;
  highlightPopup.style.display = 'none';
  document.body.appendChild(highlightPopup);
  
  // Event handlers
  highlightPopup.querySelector('.popup-close').addEventListener('click', hidePopup);
  highlightPopup.querySelector('.btn-save').addEventListener('click', handleSaveHighlight);
  
  // Prevent clicks inside popup from closing it
  highlightPopup.addEventListener('mousedown', (e) => e.stopPropagation());
  highlightPopup.addEventListener('click', (e) => e.stopPropagation());
  
  // Allow Enter key in textarea, Ctrl+Enter to save
  highlightPopup.querySelector('#highlight-note').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSaveHighlight(e);
    }
    // Stop propagation to prevent page shortcuts
    e.stopPropagation();
  });
}

// Position the popup near the selection
function positionPopup(x, y) {
  if (!highlightPopup) return;
  
  const popupWidth = 340;
  const popupHeight = 280;
  const offset = 15;
  
  // Calculate position (prefer above selection)
  let left = x - popupWidth / 2;
  let top = y - popupHeight - offset;
  
  // Keep within viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (left < 10) left = 10;
  if (left + popupWidth > viewportWidth - 10) left = viewportWidth - popupWidth - 10;
  if (top < 10) top = y + offset + 20; // Show below if not enough space above
  
  highlightPopup.style.left = `${left + window.scrollX}px`;
  highlightPopup.style.top = `${top + window.scrollY}px`;
}

// Show the popup with selected text preview
async function showPopup() {
  if (!highlightPopup) createHighlightPopup();
  
  // Update preview text (don't truncate - show full text as per Figma)
  const previewText = highlightPopup.querySelector('.preview-text');
  if (previewText) {
    previewText.textContent = selectedText;
  }
  
  // Get project name from config
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
    if (response && response.projectName) {
      const projectNameSpan = highlightPopup.querySelector('.project-name-text');
      if (projectNameSpan) {
        projectNameSpan.textContent = response.projectName;
      }
    }
  } catch (error) {
    console.error('Failed to get project name:', error);
  }
  
  // Clear previous note
  const noteTextarea = highlightPopup.querySelector('#highlight-note');
  if (noteTextarea) {
    noteTextarea.value = '';
  }
  
  // Show popup
  highlightPopup.style.display = 'block';
  setTimeout(() => highlightPopup.classList.add('visible'), 10);
  
  // Focus the textarea
  setTimeout(() => {
    if (noteTextarea) noteTextarea.focus();
  }, 100);
}

// Hide the popup
function hidePopup() {
  if (highlightPopup) {
    highlightPopup.classList.remove('visible');
    setTimeout(() => {
      highlightPopup.style.display = 'none';
    }, 200);
  }
  selectedText = '';
}

// Store selection info when text is selected (but don't show popup yet)
function storeSelection() {
  // IMPORTANT: This function ONLY stores the selection text.
  // It NEVER shows the popup. The popup is ONLY shown when user presses cmd+e/ctrl+e.
  
  // Don't store if extension is disabled
  if (!extensionEnabled) {
    selectedText = '';
    return;
  }
  
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length > 0 && text.length < 10000) {
    selectedText = text;
  } else {
    selectedText = '';
  }
  
  // EXPLICIT: Do not show popup here. Popup will only show on cmd+e/ctrl+e via handleKeyboardShortcut
}

// Show popup for currently selected text (ONLY called by keyboard shortcut cmd+e/ctrl+e)
function showPopupForSelection() {
  // Don't show if extension is disabled
  if (!extensionEnabled) {
    return;
  }
  
  // Don't show if popup is already visible
  if (highlightPopup && highlightPopup.style.display === 'block') {
    return;
  }
  
  // Check if there's a valid selection
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (!text || text.length === 0 || text.length >= 10000) {
    // No valid selection, clear stored text
    selectedText = '';
    return;
  }
  
  // Update selectedText to current selection
  selectedText = text;
  
  // Get selection coordinates
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Position and show popup
    // This function should ONLY be called from handleKeyboardShortcut (cmd+e/ctrl+e)
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    
    positionPopup(x, y);
    showPopup();
  }
}

// Handle mouse up (just store selection, don't show popup)
function onMouseUp(e) {
  // Don't trigger if clicking inside the popup
  if (highlightPopup && highlightPopup.contains(e.target)) {
    return;
  }
  
  // Clear any pending timeout
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }
  
  // Store selection after a short delay (but don't show popup)
  // IMPORTANT: Only store selection, NEVER show popup here
  // Popup will only show when user presses cmd+e or ctrl+e
  selectionTimeout = setTimeout(storeSelection, 50);
  
  // Explicitly ensure popup is NOT shown on text selection
  // Only cmd+e/ctrl+e should trigger the popup
}

// Handle clicking elsewhere to hide popup
function onMouseDown(e) {
  // Don't hide if clicking inside the popup
  if (highlightPopup && highlightPopup.contains(e.target)) {
    return;
  }
  
  // Hide popup if clicking outside
  if (highlightPopup && highlightPopup.style.display === 'block') {
    hidePopup();
  }
  
  // Clear stored selection if clicking outside (user is starting a new interaction)
  // But only if not currently selecting text
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }
  // Small delay to allow for new selection
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      selectedText = '';
    }
  }, 100);
}

// Save highlight handler
async function handleSaveHighlight(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Don't save if extension is disabled
  if (!extensionEnabled) {
    hidePopup();
    return;
  }
  
  console.log('Save button clicked');
  
  // FIRST: Capture selection rect BEFORE anything else (clicking might clear selection)
  const selection = window.getSelection();
  let selectionRect = null;
  
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    selectionRect = {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      scroll_x: window.scrollX,
      scroll_y: window.scrollY
    };
    console.log('Captured selection rect:', selectionRect);
  } else {
    console.log('No selection range available');
  }
  
  // Store references before hiding
  const noteTextarea = highlightPopup ? highlightPopup.querySelector('#highlight-note') : null;
  const note = noteTextarea ? noteTextarea.value.trim() : '';
  
  // Validate text
  if (!selectedText) {
    showNotification('No text selected', 'error');
    return;
  }
  
  // NOW hide popup (after capturing selection rect)
  if (highlightPopup) {
    console.log('Hiding popup now');
    highlightPopup.style.display = 'none';
    highlightPopup.classList.remove('visible');
  }
  
  // Force browser to repaint by waiting for next animation frame
  // This ensures the popup removal is rendered before screenshot
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => requestAnimationFrame(resolve));
  
  // Additional small delay to ensure screenshot captures clean page
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Get page info
  const highlightData = {
    text: selectedText,
    source_url: window.location.href,
    page_title: document.title,
    note: note || null,
    timestamp: new Date().toISOString(),
    selection_rect: selectionRect
  };
  
  // Send to background script (which will capture screenshot - popup is now fully gone)
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveHighlight',
      data: highlightData
    });
    
    if (response.success) {
      // Success - popup stays hidden
      showNotification('Highlight saved!', 'success');
      // Visual feedback - briefly highlight the selected text
      highlightSelectedText();
      selectedText = ''; // Clear selected text
    } else {
      // Error - show popup again with error message
      showNotification(response.error || 'Failed to save highlight', 'error');
      // Restore popup
      if (highlightPopup && noteTextarea) {
        highlightPopup.style.display = 'block';
        setTimeout(() => highlightPopup.classList.add('visible'), 10);
        // Restore note value
        noteTextarea.value = note;
        // Focus textarea
        setTimeout(() => noteTextarea.focus(), 100);
      }
    }
  } catch (error) {
    console.error('Error saving highlight:', error);
    
    // Error - show popup again
    if (highlightPopup && noteTextarea) {
      highlightPopup.style.display = 'block';
      setTimeout(() => highlightPopup.classList.add('visible'), 10);
      // Restore note value
      noteTextarea.value = note;
      // Focus textarea
      setTimeout(() => noteTextarea.focus(), 100);
    }
    
    // Check for extension context invalidated error
    if (error.message && error.message.includes('Extension context invalidated')) {
      showNotification('Extension was updated. Please refresh this page.', 'error');
    } else if (error.message && error.message.includes('Receiving end does not exist')) {
      showNotification('Extension not ready. Please refresh this page.', 'error');
    } else {
      showNotification('Failed to save highlight. Try refreshing the page.', 'error');
    }
  }
}

// Show notification toast
function showNotification(message, type = 'info') {
  // Remove existing notification
  const existing = document.getElementById('ai-research-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'ai-research-notification';
  notification.className = `ai-research-notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => notification.classList.add('visible'), 10);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('visible');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Visual highlight effect on saved text
function highlightSelectedText() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return;
  
  try {
    const range = selection.getRangeAt(0);
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'ai-research-saved-highlight';
    
    // Wrap selected content
    range.surroundContents(highlightSpan);
    
    // Remove highlight effect after animation
    setTimeout(() => {
      const parent = highlightSpan.parentNode;
      while (highlightSpan.firstChild) {
        parent.insertBefore(highlightSpan.firstChild, highlightSpan);
      }
      parent.removeChild(highlightSpan);
    }, 2000);
  } catch (e) {
    // Can't wrap if selection spans multiple elements - that's ok
    console.log('Could not apply visual highlight effect');
  }
  
  // Clear selection
  selection.removeAllRanges();
}

// Load extension enabled state
async function loadExtensionState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
    extensionEnabled = response?.extensionEnabled !== false; // Default to true if not set
  } catch (error) {
    console.error('Failed to load extension state:', error);
    extensionEnabled = true; // Default to enabled on error
  }
}

// Handle keyboard shortcut (Cmd+E on Mac, Ctrl+E on Windows/Linux)
function handleKeyboardShortcut(e) {
  // Don't trigger if user is typing in an input field, textarea, or contenteditable
  const activeElement = document.activeElement;
  if (activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.isContentEditable ||
    activeElement.closest('[contenteditable="true"]')
  )) {
    return;
  }
  
  // Check for Cmd+E (Mac) or Ctrl+E (Windows/Linux)
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isShortcut = isMac 
    ? (e.metaKey && e.key === 'e' && !e.ctrlKey && !e.altKey && !e.shiftKey)
    : (e.ctrlKey && e.key === 'e' && !e.metaKey && !e.altKey && !e.shiftKey);
  
  if (isShortcut) {
    // Don't show popup if extension is disabled
    if (!extensionEnabled) {
      return;
    }
    
    // Check if there's a valid selection before preventing default
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text && text.length > 0 && text.length < 10000) {
      e.preventDefault();
      e.stopPropagation();
      
      // Update stored selection to current selection (in case it changed)
      selectedText = text;
      
      // Show popup ONLY when keyboard shortcut is pressed
      // This is the ONLY place where showPopupForSelection should be called
      showPopupForSelection();
    }
    // If no valid selection, let the browser handle the shortcut normally
  }
}

// Initialize
async function init() {
  // Load extension state first
  await loadExtensionState();
  
  createHighlightPopup();
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousedown', onMouseDown);
  
  // Handle keyboard shortcut (Cmd+E / Ctrl+E)
  document.addEventListener('keydown', handleKeyboardShortcut);
  
  // Handle keyboard selection (Shift+Arrow keys) - store selection but don't show popup
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey && !highlightPopup?.contains(document.activeElement)) {
      if (selectionTimeout) clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(storeSelection, 150);
    }
  });
  
  // Handle Escape to close popup
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && highlightPopup && highlightPopup.style.display === 'block') {
      hidePopup();
    }
  });
  
  // Listen for toggle state changes from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTENSION_TOGGLE_CHANGED') {
      extensionEnabled = message.enabled;
      // Hide popup if it's visible and extension is disabled
      if (!extensionEnabled && highlightPopup && highlightPopup.style.display === 'block') {
        hidePopup();
      }
    }
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
