/**
 * Popup script for AI Research Platform Highlights
 * Handles authentication, project selection, and configuration
 */

// DOM Elements - Auth View
const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const emailView = document.getElementById('email-view');
const passwordView = document.getElementById('password-view');
const emailForm = document.getElementById('email-form');
const passwordForm = document.getElementById('password-form');
const emailSubmitBtn = document.getElementById('email-submit-btn');
const passwordSubmitBtn = document.getElementById('password-submit-btn');
const googleLoginBtn = document.getElementById('google-login');
const signupLink = document.getElementById('signup-link');
const signupLinkPassword = document.getElementById('signup-link-password');
const changeEmailLink = document.getElementById('change-email-link');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const emailDisplay = document.getElementById('email-display');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const authMessage = document.getElementById('auth-message');

// Store email for password view
let currentEmail = '';

// DOM Elements - Main View
const accountButton = document.getElementById('account-button');
const accountDropdown = document.getElementById('account-dropdown');
const logoutBtn = document.getElementById('logout-btn');
const openAppBtn = document.getElementById('open-app-btn');
const disableHighlightsBtn = document.getElementById('disable-highlights-btn');
const projectSelect = document.getElementById('project-select');
const projectSelector = document.getElementById('project-selector');
const projectDropdown = document.getElementById('project-dropdown');
const projectSearch = document.getElementById('project-search');
const projectDropdownList = document.getElementById('project-dropdown-list');
const projectName = document.getElementById('project-name');
const projectColor = document.getElementById('project-color');
const homeContent = document.getElementById('home-content');
const highlightsDisabledContent = document.getElementById('highlights-disabled-content');
const extensionToggleOverlay = document.getElementById('extension-toggle-overlay');
const messageEl = document.getElementById('message');
const accountInitial = document.getElementById('account-initial');

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
  // Email form submission
  emailForm.addEventListener('submit', handleEmailSubmit);
  
  // Password form submission
  passwordForm.addEventListener('submit', handlePasswordSubmit);
  
  // Social login
  googleLoginBtn.addEventListener('click', handleGoogleLogin);
  
  // Sign up links
  if (signupLink) {
    signupLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'http://localhost:3000/register' });
    });
  }
  if (signupLinkPassword) {
    signupLinkPassword.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'http://localhost:3000/register' });
    });
  }
  
  // Change email link
  if (changeEmailLink) {
    changeEmailLink.addEventListener('click', (e) => {
      e.preventDefault();
      showEmailView();
    });
  }
  
  // Forgot password link
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      // TODO: Implement password reset
      alert('Password reset will be available soon. Please contact support if you need help accessing your account.');
    });
  }
  
  // Main view
  if (accountButton) {
    accountButton.addEventListener('click', toggleAccountDropdown);
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  if (openAppBtn) {
    openAppBtn.addEventListener('click', handleOpenApp);
  }
  if (disableHighlightsBtn) {
    disableHighlightsBtn.addEventListener('click', handleDisableHighlights);
  }
  if (projectSelect) {
    projectSelect.addEventListener('change', handleProjectChange);
  }
  if (projectSelector) {
    projectSelector.addEventListener('click', toggleProjectDropdown);
  }
  if (projectSearch) {
    projectSearch.addEventListener('input', handleProjectSearch);
    projectSearch.addEventListener('keydown', handleProjectSearchKeydown);
  }
  if (extensionToggleOverlay) {
    extensionToggleOverlay.addEventListener('change', handleExtensionToggle);
  }
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (accountDropdown && accountButton && !accountButton.contains(e.target) && !accountDropdown.contains(e.target)) {
      accountDropdown.classList.add('hidden');
    }
    if (projectDropdown && projectSelector && 
        !projectSelector.contains(e.target) && 
        !projectDropdown.contains(e.target)) {
      closeProjectDropdown();
    }
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


// Handle email form submission - go to password view
function handleEmailSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  
  hideEmailError();
  
  if (!email) {
    showEmailError('Please enter your email address');
    return;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showEmailError('Please enter a valid email address');
    return;
  }
  
  // Store email and show password view
  currentEmail = email;
  emailDisplay.textContent = email;
  showPasswordView();
}

// Handle password form submission - perform login
async function handlePasswordSubmit(e) {
  e.preventDefault();
  const password = document.getElementById('login-password').value;
  
  hidePasswordError();
  
  if (!password) {
    showPasswordError('Please enter your password');
    return;
  }
  
  if (!currentEmail) {
    showPasswordError('Email not found. Please go back and enter your email.');
    return;
  }
  
  passwordSubmitBtn.classList.add('loading');
  passwordSubmitBtn.disabled = true;
  
  try {
    const config = await getConfig();
    const apiUrl = config.apiUrl || 'http://localhost:5001';
    
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: currentEmail, password })
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
      // Clear password field
      document.getElementById('login-password').value = '';
    } else {
      showPasswordError(data.error || 'Login failed. Please check your password.');
    }
  } catch (error) {
    console.error('Login error:', error);
    showPasswordError('Network error. Is the server running?');
  } finally {
    passwordSubmitBtn.classList.remove('loading');
    passwordSubmitBtn.disabled = false;
  }
}

// Show email view
function showEmailView() {
  emailView.classList.remove('hidden');
  emailView.classList.add('active');
  passwordView.classList.add('hidden');
  passwordView.classList.remove('active');
  // Clear password field
  document.getElementById('login-password').value = '';
  hideEmailError();
  hidePasswordError();
}

// Show password view
function showPasswordView() {
  emailView.classList.add('hidden');
  emailView.classList.remove('active');
  passwordView.classList.remove('hidden');
  passwordView.classList.add('active');
  // Focus password field
  setTimeout(() => {
    document.getElementById('login-password').focus();
  }, 100);
  hidePasswordError();
}

// Show email error
function showEmailError(message) {
  emailError.textContent = message;
  emailError.classList.remove('hidden');
}

// Hide email error
function hideEmailError() {
  emailError.classList.add('hidden');
}

// Show password error
function showPasswordError(message) {
  passwordError.textContent = message;
  passwordError.classList.remove('hidden');
}

// Hide password error
function hidePasswordError() {
  passwordError.classList.add('hidden');
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
  // Clear form fields and reset to email view
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  currentEmail = '';
  showEmailView();
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
        user_id: data.user_id,
        first_name: data.first_name
      };
      // Set account initial
      if (accountInitial && currentUser.first_name) {
        accountInitial.textContent = currentUser.first_name.charAt(0).toUpperCase();
      } else if (accountInitial && currentUser.email) {
        accountInitial.textContent = currentUser.email.charAt(0).toUpperCase();
      }
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
        const selectedProject = projects.find(p => p.project_id === config.projectId);
        if (selectedProject) {
          projectSelect.value = config.projectId;
          await handleProjectChange();
        } else {
          updateProjectDisplay(null);
        }
      } else {
        updateProjectDisplay(null);
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
    await saveConfig({ projectId: null, projectName: null });
    updateProjectDisplay(null);
    return;
  }
  
  const project = projects.find(p => p.project_id === projectId);
  if (project) {
    await saveConfig({ projectId, projectName: project.project_name });
    updateProjectDisplay(project);
  }
}

// Update project display
function updateProjectDisplay(project) {
  if (!project) {
    if (projectName) projectName.textContent = 'Select a project...';
    return;
  }
  
  if (projectName) projectName.textContent = project.project_name || 'Project_Name';
  if (projectColor && project.color) {
    projectColor.style.backgroundColor = project.color;
  }
  
  // Also update disabled view
  const projectNameDisabled = document.getElementById('project-name-disabled');
  const projectColorDisabled = document.getElementById('project-color-disabled');
  if (projectNameDisabled) projectNameDisabled.textContent = project.project_name || 'Project_Name';
  if (projectColorDisabled && project.color) {
    projectColorDisabled.style.backgroundColor = project.color;
  }
}

// Toggle project dropdown
function toggleProjectDropdown(e) {
  if (e) e.stopPropagation();
  
  if (!projectDropdown || !projectSelector) return;
  
  const isHidden = projectDropdown.classList.contains('hidden');
  
  if (isHidden) {
    openProjectDropdown();
  } else {
    closeProjectDropdown();
  }
}

// Open project dropdown
function openProjectDropdown() {
  if (!projectDropdown || !projectSearch || !projectName || !projectColor) return;
  
  // Hide project name and color, show search input
  projectName.classList.add('hidden');
  projectColor.classList.add('hidden');
  projectSearch.classList.remove('hidden');
  
  // Show dropdown and focus search
  projectDropdown.classList.remove('hidden');
  projectSearch.focus();
  projectSearch.value = '';
  renderProjectDropdownItems(projects);
}

// Close project dropdown
function closeProjectDropdown() {
  if (!projectDropdown || !projectSearch || !projectName || !projectColor) return;
  
  // Hide search input, show project name and color
  projectSearch.classList.add('hidden');
  projectName.classList.remove('hidden');
  projectColor.classList.remove('hidden');
  
  // Hide dropdown and clear search
  projectDropdown.classList.add('hidden');
  projectSearch.value = '';
}

// Handle project search
function handleProjectSearch(e) {
  const searchTerm = e.target.value.toLowerCase().trim();
  renderProjectDropdownItems(projects, searchTerm);
}

// Handle keyboard navigation in search
function handleProjectSearchKeydown(e) {
  if (e.key === 'Escape') {
    closeProjectDropdown();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const firstItem = projectDropdownList.querySelector('.project-dropdown-item');
    if (firstItem) {
      firstItem.click();
    }
  }
}

// Render project dropdown items (max 3 results)
function renderProjectDropdownItems(projectsList, searchTerm = '') {
  if (!projectDropdownList) return;
  
  let filteredProjects = projectsList || [];
  
  // Filter by search term
  if (searchTerm) {
    filteredProjects = projectsList.filter(project => 
      project.project_name.toLowerCase().includes(searchTerm)
    );
  }
  
  // Limit to 3 results
  filteredProjects = filteredProjects.slice(0, 3);
  
  // Clear existing items
  projectDropdownList.innerHTML = '';
  
  if (filteredProjects.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'project-dropdown-empty';
    emptyItem.textContent = searchTerm ? 'No projects found' : 'No projects available';
    projectDropdownList.appendChild(emptyItem);
    return;
  }
  
  // Render project items
  filteredProjects.forEach(project => {
    const item = document.createElement('div');
    item.className = 'project-dropdown-item';
    item.innerHTML = `
      <div class="project-dropdown-item-color" style="background-color: ${project.color || '#b52121'}"></div>
      <span class="project-dropdown-item-name">${project.project_name || 'Unnamed Project'}</span>
    `;
    
    item.addEventListener('click', () => {
      selectProject(project);
      closeProjectDropdown();
    });
    
    projectDropdownList.appendChild(item);
  });
}

// Select project
async function selectProject(project) {
  if (!project || !project.project_id) return;
  
  projectSelect.value = project.project_id;
  await handleProjectChange();
}

// Toggle account dropdown
function toggleAccountDropdown(e) {
  e.stopPropagation();
  if (accountDropdown) {
    accountDropdown.classList.toggle('hidden');
  }
}

// Handle open app
function handleOpenApp() {
  chrome.tabs.create({ url: 'http://localhost:3000' });
  if (accountDropdown) accountDropdown.classList.add('hidden');
}

// Handle disable highlights
function handleDisableHighlights() {
  if (extensionToggleOverlay) {
    extensionToggleOverlay.checked = false;
    handleExtensionToggle();
  }
  if (accountDropdown) accountDropdown.classList.add('hidden');
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
  // Show email view by default
  showEmailView();
}

// Show main view
async function showMainView() {
  authView.classList.add('hidden');
  mainView.classList.remove('hidden');
  
  // Load extension toggle state
  const config = await getConfig();
  const extensionEnabled = config.extensionEnabled !== undefined ? config.extensionEnabled : true;
  
  if (extensionToggleOverlay) {
    extensionToggleOverlay.checked = extensionEnabled;
  }
  
  // Show/hide appropriate content based on extension state
  updateHighlightsView(extensionEnabled);
}

// Update highlights view based on enabled state
function updateHighlightsView(enabled) {
  if (homeContent && highlightsDisabledContent) {
    if (enabled) {
      homeContent.classList.remove('hidden');
      highlightsDisabledContent.classList.add('hidden');
    } else {
      homeContent.classList.add('hidden');
      highlightsDisabledContent.classList.remove('hidden');
    }
  }
}

// Handle extension toggle
async function handleExtensionToggle() {
  const enabled = extensionToggleOverlay ? extensionToggleOverlay.checked : true;
  await saveConfig({ extensionEnabled: enabled });
  
  // Update view
  updateHighlightsView(enabled);
  
  // Notify content scripts of the change
  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'EXTENSION_TOGGLE_CHANGED',
        enabled: enabled
      }).catch(() => {
        // Ignore errors for tabs that don't have content script loaded
      });
    });
  } catch (error) {
    console.error('Failed to notify content scripts:', error);
  }
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
    projectId: null,
    extensionEnabled: true
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

