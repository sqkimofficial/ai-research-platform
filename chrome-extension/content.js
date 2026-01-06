/**
 * Content script for AI Research Platform Highlights
 * Detects text selection and shows highlight popup with note input
 */

// Create highlight popup element
let highlightPopup = null;
let selectedText = '';
let selectionTimeout = null;

// Initialize the highlight popup
function createHighlightPopup() {
  if (highlightPopup) return;
  
  highlightPopup = document.createElement('div');
  highlightPopup.id = 'ai-research-highlight-popup';
  highlightPopup.innerHTML = `
    <div class="popup-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span class="popup-title">Save Highlight</span>
      <button class="popup-close" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="popup-preview">
      <span class="preview-label">Selected text:</span>
      <p class="preview-text"></p>
    </div>
    <div class="popup-note">
      <label for="highlight-note">Add a note (optional):</label>
      <textarea id="highlight-note" placeholder="Why is this important? What does it relate to?"></textarea>
    </div>
    <div class="popup-actions">
      <button class="btn-cancel">Cancel</button>
      <button class="btn-save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save Highlight
      </button>
    </div>
  `;
  highlightPopup.style.display = 'none';
  document.body.appendChild(highlightPopup);
  
  // Event handlers
  highlightPopup.querySelector('.popup-close').addEventListener('click', hidePopup);
  highlightPopup.querySelector('.btn-cancel').addEventListener('click', hidePopup);
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
function showPopup() {
  if (!highlightPopup) createHighlightPopup();
  
  // Update preview text (truncate if too long)
  const previewText = highlightPopup.querySelector('.preview-text');
  const maxPreviewLength = 150;
  if (selectedText.length > maxPreviewLength) {
    previewText.textContent = selectedText.substring(0, maxPreviewLength) + '...';
  } else {
    previewText.textContent = selectedText;
  }
  
  // Clear previous note
  highlightPopup.querySelector('#highlight-note').value = '';
  
  // Show popup
  highlightPopup.style.display = 'block';
  setTimeout(() => highlightPopup.classList.add('visible'), 10);
  
  // Focus the textarea
  setTimeout(() => highlightPopup.querySelector('#highlight-note').focus(), 100);
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

// Handle text selection
function handleSelection() {
  // Don't show if popup is already visible
  if (highlightPopup && highlightPopup.style.display === 'block') {
    return;
  }
  
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length > 0 && text.length < 10000) {
    selectedText = text;
    
    // Get selection coordinates
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Position and show popup
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    
    positionPopup(x, y);
    showPopup();
  }
}

// Debounced selection handler
function onMouseUp(e) {
  // Don't trigger if clicking inside the popup
  if (highlightPopup && highlightPopup.contains(e.target)) {
    return;
  }
  
  // Clear any pending timeout
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }
  
  // Debounce selection detection
  selectionTimeout = setTimeout(handleSelection, 150);
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
}

// Save highlight handler
async function handleSaveHighlight(e) {
  e.preventDefault();
  e.stopPropagation();
  
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

// Initialize
function init() {
  createHighlightPopup();
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousedown', onMouseDown);
  
  // Handle keyboard selection (Shift+Arrow keys)
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey && !highlightPopup?.contains(document.activeElement)) {
      if (selectionTimeout) clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(handleSelection, 150);
    }
  });
  
  // Handle Escape to close popup
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && highlightPopup && highlightPopup.style.display === 'block') {
      hidePopup();
    }
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
