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
const openAppBtn = document.getElementById('open-app-button');
const homeContent = document.getElementById('home-content');
const messageEl = document.getElementById('message');
const accountInitial = document.getElementById('account-initial');

// State
let currentUser = null;

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
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (accountDropdown && accountButton && !accountButton.contains(e.target) && !accountDropdown.contains(e.target)) {
      accountDropdown.classList.add('hidden');
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

