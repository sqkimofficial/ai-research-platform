/**
 * Popup script for AI Research Platform Highlights
 * Handles configuration and status display
 */

// DOM Elements
const apiUrlInput = document.getElementById('api-url');
const tokenInput = document.getElementById('token');
const toggleTokenBtn = document.getElementById('toggle-token');
const projectIdInput = document.getElementById('project-id');
const saveConfigBtn = document.getElementById('save-config');
const testConnectionBtn = document.getElementById('test-connection');
const syncQueueBtn = document.getElementById('sync-queue');
const queueCountEl = document.getElementById('queue-count');
const statusIndicator = document.getElementById('status-indicator');
const messageEl = document.getElementById('message');

// Load saved configuration
async function loadConfig() {
  const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
  
  if (response.apiUrl) apiUrlInput.value = response.apiUrl;
  if (response.token) tokenInput.value = response.token;
  if (response.projectId) projectIdInput.value = response.projectId;
  
  // Update status based on config
  updateStatus(!!response.token && !!response.projectId);
}

// Load queue status
async function loadQueueStatus() {
  const response = await chrome.runtime.sendMessage({ action: 'getQueueStatus' });
  queueCountEl.textContent = response.queueLength || 0;
}

// Save configuration
async function saveConfig() {
  const config = {
    apiUrl: apiUrlInput.value.trim() || 'http://localhost:5001',
    token: tokenInput.value.trim(),
    projectId: projectIdInput.value.trim()
  };
  
  saveConfigBtn.classList.add('loading');
  
  try {
    await chrome.runtime.sendMessage({ action: 'saveConfig', config });
    showMessage('Configuration saved!', 'success');
    updateStatus(!!config.token && !!config.projectId);
  } catch (error) {
    showMessage('Failed to save configuration', 'error');
  }
  
  saveConfigBtn.classList.remove('loading');
}

// Test API connection
async function testConnection() {
  const apiUrl = apiUrlInput.value.trim() || 'http://localhost:5000';
  const token = tokenInput.value.trim();
  
  if (!token) {
    showMessage('Please enter an auth token first', 'error');
    return;
  }
  
  testConnectionBtn.classList.add('loading');
  
  try {
    const response = await fetch(`${apiUrl}/api/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      showMessage('Connection successful!', 'success');
      updateStatus(true);
    } else {
      showMessage(`Connection failed: ${response.status}`, 'error');
      updateStatus(false);
    }
  } catch (error) {
    showMessage('Connection failed: Network error', 'error');
    updateStatus(false);
  }
  
  testConnectionBtn.classList.remove('loading');
}

// Sync queued highlights
async function syncQueue() {
  syncQueueBtn.classList.add('loading');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'processQueue' });
    
    if (response.success) {
      queueCountEl.textContent = response.queueLength || 0;
      if (response.queueLength === 0) {
        showMessage('All highlights synced!', 'success');
      } else {
        showMessage(`${response.queueLength} highlights still pending`, 'info');
      }
    } else {
      showMessage(response.error || 'Sync failed', 'error');
    }
  } catch (error) {
    showMessage('Sync failed', 'error');
  }
  
  syncQueueBtn.classList.remove('loading');
}

// Update status indicator
function updateStatus(connected) {
  statusIndicator.className = `status ${connected ? 'connected' : 'disconnected'}`;
  statusIndicator.querySelector('.text').textContent = connected ? 'Connected' : 'Disconnected';
}

// Show message
function showMessage(text, type = 'info') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 5000);
}

// Toggle token visibility
function toggleTokenVisibility() {
  const type = tokenInput.type === 'password' ? 'text' : 'password';
  tokenInput.type = type;
}

// Event Listeners
saveConfigBtn.addEventListener('click', saveConfig);
testConnectionBtn.addEventListener('click', testConnection);
syncQueueBtn.addEventListener('click', syncQueue);
toggleTokenBtn.addEventListener('click', toggleTokenVisibility);

// Allow Enter key to save
document.querySelectorAll('input').forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveConfig();
    }
  });
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadQueueStatus();
});

