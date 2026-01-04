/**
 * Popup script for AI Research Platform Highlights
 * Handles authentication, project selection, and configuration
 */

// DOM Elements - Auth View
const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const googleLoginBtn = document.getElementById('google-login');
const signupLink = document.getElementById('signup-link');
const authMessage = document.getElementById('auth-message');

// DOM Elements - Main View
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const projectSelect = document.getElementById('project-select');
const apiUrlInput = document.getElementById('api-url');
const redirectUriInput = document.getElementById('redirect-uri');
const copyRedirectUriBtn = document.getElementById('copy-redirect-uri');
const syncQueueBtn = document.getElementById('sync-queue');
const queueCountEl = document.getElementById('queue-count');
const statusIndicator = document.getElementById('status-indicator');
const messageEl = document.getElementById('message');
const configToggle = document.getElementById('config-toggle');
const configContent = document.getElementById('config-content');

// State
let currentUser = null;
let projects = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();
  setupEventListeners();
});

// Check if user is authenticated
async function checkAuthStatus() {
  const config = await getConfig();
  
  if (config.token) {
    // Verify token is still valid
    try {
      const isValid = await verifyToken(config.apiUrl, config.token);
      if (isValid) {
        await loadUserInfo(config.token, config.apiUrl);
        showMainView();
        await loadProjects();
      } else {
        // Token expired
        await clearAuth();
        showAuthView();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      await clearAuth();
      showAuthView();
    }
  } else {
    showAuthView();
  }
}


// Setup event listeners
function setupEventListeners() {
  // Login button
  loginBtn.addEventListener('click', handleLogin);
  
  // Social login
  googleLoginBtn.addEventListener('click', handleGoogleLogin);
  
  // Sign up link
  if (signupLink) {
    signupLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'http://localhost:3000/register' });
    });
  }
  
  // Main view
  logoutBtn.addEventListener('click', handleLogout);
  projectSelect.addEventListener('change', handleProjectChange);
  syncQueueBtn.addEventListener('click', syncQueue);
  configToggle.addEventListener('click', toggleConfig);
  if (copyRedirectUriBtn) {
    copyRedirectUriBtn.addEventListener('click', copyRedirectUri);
  }
  
  // Enter key handlers
  document.getElementById('login-email').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  // Listen for messages from background script (Google auth completion)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GOOGLE_AUTH_COMPLETE' && message.token) {
      // Token received from background script
      handleGoogleAuthComplete(message.token);
      sendResponse({ success: true });
    }
    return true;
  });
}

// Handle Google auth completion
async function handleGoogleAuthComplete(token) {
  try {
    // Save token
    await saveConfig({ token });
    
    // Verify and load user info
    const config = await getConfig();
    const isValid = await verifyToken(config.apiUrl, token);
    if (isValid) {
      await loadUserInfo(token, config.apiUrl);
      showMainView();
      await loadProjects();
      showAuthMessage('Successfully signed in with Google!', 'success');
    } else {
      showAuthMessage('Token validation failed', 'error');
    }
  } catch (error) {
    console.error('Error handling Google auth completion:', error);
    showAuthMessage('Failed to complete sign-in', 'error');
  }
}


// Handle login
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  if (!email || !password) {
    showAuthMessage('Please enter email and password', 'error');
    return;
  }
  
  loginBtn.classList.add('loading');
  hideAuthMessage();
  
  try {
    const config = await getConfig();
    const apiUrl = config.apiUrl || 'http://localhost:5001';
    
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Save token and user info
      await saveConfig({
        token: data.token,
        apiUrl: apiUrl
      });
      
      currentUser = {
        email: data.email,
        user_id: data.user_id
      };
      
      showMainView();
      await loadProjects();
    } else {
      showAuthMessage(data.error || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showAuthMessage('Network error. Is the server running?', 'error');
  } finally {
    loginBtn.classList.remove('loading');
  }
}

// Handle Google login using Chrome Identity API
async function handleGoogleLogin() {
  googleLoginBtn.classList.add('loading');
  hideAuthMessage();
  showAuthMessage('Opening Google sign-in...', 'info');
  
  try {
    // Import auth utility (it's loaded in background script)
    // Send message to background script to handle OAuth
    const response = await chrome.runtime.sendMessage({
      action: 'googleAuth',
      provider: 'google'
    });
    
    if (response.success && response.token) {
      // Save token
      const config = await getConfig();
      await saveConfig({ token: response.token });
      
      // Verify and load user info
      const isValid = await verifyToken(config.apiUrl, response.token);
      if (isValid) {
        await loadUserInfo(response.token, config.apiUrl);
        showMainView();
        await loadProjects();
        showAuthMessage('Successfully signed in with Google!', 'success');
      } else {
        showAuthMessage('Token validation failed', 'error');
      }
    } else {
      showAuthMessage(response.error || 'Google sign-in failed', 'error');
    }
  } catch (error) {
    console.error('Google login error:', error);
    if (error.message && error.message.includes('canceled')) {
      showAuthMessage('Sign-in cancelled', 'info');
    } else {
      showAuthMessage('Sign-in failed: ' + error.message, 'error');
    }
  } finally {
    googleLoginBtn.classList.remove('loading');
  }
}


// Handle token received from web app
async function handleGoogleAuthToken(token) {
  try {
    const config = await getConfig();
    const apiUrl = config.apiUrl || 'http://localhost:5001';
    
    // Save token
    await saveConfig({ token });
    
    // Verify and load user info
    const isValid = await verifyToken(apiUrl, token);
    if (isValid) {
      await loadUserInfo(token, apiUrl);
      showMainView();
      await loadProjects();
      showAuthMessage('Successfully signed in with Google!', 'success');
    } else {
      showAuthMessage('Token validation failed', 'error');
    }
  } catch (error) {
    console.error('Error handling Google auth token:', error);
    showAuthMessage('Failed to complete sign-in', 'error');
  }
}

// Handle logout
async function handleLogout() {
  await clearAuth();
  showAuthView();
  // Clear form fields
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

// Load user info
async function loadUserInfo(token, apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      currentUser = {
        email: data.email,
        user_id: data.user_id
      };
      userEmailEl.textContent = currentUser.email;
    }
  } catch (error) {
    console.error('Failed to load user info:', error);
  }
}

// Load projects
async function loadProjects() {
  const config = await getConfig();
  
  if (!config.token) {
    return;
  }
  
  projectSelect.innerHTML = '<option value="">Loading projects...</option>';
  projectSelect.disabled = true;
  
  try {
    const response = await fetch(`${config.apiUrl}/api/project`, {
      headers: {
        'Authorization': `Bearer ${config.token}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      projects = data.projects || [];
      
      // Populate dropdown
      projectSelect.innerHTML = '<option value="">Select a project...</option>';
      projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.project_id;
        option.textContent = project.project_name;
        if (config.projectId === project.project_id) {
          option.selected = true;
        }
        projectSelect.appendChild(option);
      });
      
      // Auto-select if only one project
      if (projects.length === 1) {
        projectSelect.value = projects[0].project_id;
        await handleProjectChange();
      } else if (config.projectId) {
        projectSelect.value = config.projectId;
      }
    } else {
      projectSelect.innerHTML = '<option value="">Failed to load projects</option>';
      showMessage('Failed to load projects', 'error');
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
    projectSelect.innerHTML = '<option value="">Network error</option>';
    showMessage('Network error loading projects', 'error');
  } finally {
    projectSelect.disabled = false;
  }
}

// Handle project selection change
async function handleProjectChange() {
  const projectId = projectSelect.value;
  
  if (!projectId) {
    await saveConfig({ projectId: null });
    updateStatus(false);
    return;
  }
  
  await saveConfig({ projectId });
  updateStatus(true);
  await loadQueueStatus();
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

// Load queue status
async function loadQueueStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getQueueStatus' });
    queueCountEl.textContent = response.queueLength || 0;
  } catch (error) {
    console.error('Failed to load queue status:', error);
  }
}

// Toggle config section
function toggleConfig() {
  const isHidden = configContent.classList.contains('hidden');
  configContent.classList.toggle('hidden');
  
  const icon = configToggle.querySelector('svg');
  icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  
  // Load redirect URI when opening config
  if (isHidden) {
    loadRedirectUri();
  }
}

// Load and display redirect URI
function loadRedirectUri() {
  // Check if redirectUriInput exists
  if (!redirectUriInput) {
    console.warn('Redirect URI input not found');
    return;
  }
  
  try {
    // Check if chrome.identity API is available
    if (!chrome || !chrome.identity || typeof chrome.identity.getRedirectURL !== 'function') {
      console.error('chrome.identity API is not available. Make sure:');
      console.error('1. The extension has "identity" permission in manifest.json');
      console.error('2. The extension has been reloaded after adding permissions');
      redirectUriInput.value = 'Error: chrome.identity API not available. Please reload extension.';
      return;
    }
    
    const redirectUri = chrome.identity.getRedirectURL();
    if (redirectUri) {
      redirectUriInput.value = redirectUri;
    } else {
      redirectUriInput.value = 'Error: Could not get redirect URI';
    }
  } catch (error) {
    console.error('Failed to get redirect URI:', error);
    redirectUriInput.value = `Error: ${error.message || 'Unable to get redirect URI'}`;
  }
}

// Copy redirect URI to clipboard
async function copyRedirectUri() {
  try {
    const redirectUri = redirectUriInput.value;
    if (!redirectUri || redirectUri.startsWith('Error:')) {
      showMessage('No redirect URI available', 'error');
      return;
    }
    
    await navigator.clipboard.writeText(redirectUri);
    showMessage('Redirect URI copied to clipboard!', 'success');
    
    // Visual feedback
    copyRedirectUriBtn.style.background = 'rgba(16, 185, 129, 0.3)';
    setTimeout(() => {
      copyRedirectUriBtn.style.background = '';
    }, 1000);
  } catch (error) {
    console.error('Failed to copy:', error);
    showMessage('Failed to copy to clipboard', 'error');
  }
}

// Verify token
async function verifyToken(apiUrl, token) {
  try {
    const response = await fetch(`${apiUrl}/api/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    return false;
  }
}

// Show auth view
function showAuthView() {
  authView.classList.remove('hidden');
  mainView.classList.add('hidden');
}

// Show main view
function showMainView() {
  authView.classList.add('hidden');
  mainView.classList.remove('hidden');
  updateStatus(true);
  loadQueueStatus();
  
  // Load saved API URL
  getConfig().then(config => {
    if (config.apiUrl) {
      apiUrlInput.value = config.apiUrl;
    }
  });
  
  // Load redirect URI if config is open
  if (!configContent.classList.contains('hidden')) {
    loadRedirectUri();
  }
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
  messageEl.classList.remove('hidden');
  
  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 5000);
}

// Show auth message
function showAuthMessage(text, type = 'info') {
  authMessage.textContent = text;
  authMessage.className = `message ${type}`;
  authMessage.classList.remove('hidden');
}

// Hide auth message
function hideAuthMessage() {
  authMessage.classList.add('hidden');
}

// Get config from storage
async function getConfig() {
  const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
  return response || {
    apiUrl: 'http://localhost:5001',
    token: null,
    projectId: null
  };
}

// Save config
async function saveConfig(updates) {
  const current = await getConfig();
  const newConfig = { ...current, ...updates };
  await chrome.runtime.sendMessage({ action: 'saveConfig', config: newConfig });
}

// Clear auth
async function clearAuth() {
  await saveConfig({ token: null, projectId: null });
  currentUser = null;
  projects = [];
}

// Save API URL when changed
apiUrlInput.addEventListener('change', async () => {
  await saveConfig({ apiUrl: apiUrlInput.value.trim() || 'http://localhost:5001' });
});
