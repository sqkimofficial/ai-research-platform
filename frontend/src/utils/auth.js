/**
 * Auth utilities for hybrid authentication:
 * - Email/password: Our backend with Auth0 password grant
 * - Social login: Auth0 SDK redirect
 */

const TOKEN_KEY = 'stitch_token';

/**
 * Get the authentication token
 * Checks both our custom token and Auth0's cached token
 * 
 * @returns {string|null} The access token or null if not found
 */
export const getToken = () => {
  // First check our custom token (from email/password login)
  const customToken = localStorage.getItem(TOKEN_KEY);
  if (customToken) {
    return customToken;
  }
  
  // Fallback: Check Auth0's cached token (from social login)
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('@@auth0spajs@@')) {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.body && data.body.access_token) {
          return data.body.access_token;
        }
      }
    }
  } catch (e) {
    console.error('Error getting token from localStorage:', e);
  }
  return null;
};

/**
 * Check if user has a valid token (email/password login)
 * @returns {boolean}
 */
export const hasToken = () => {
  return !!localStorage.getItem(TOKEN_KEY);
};

/**
 * Set the authentication token (for email/password login)
 * @param {string} token - The token to store
 */
export const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
};

/**
 * Remove authentication data from localStorage
 */
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('userFirstName');
  localStorage.removeItem('userId');
};

/**
 * Get the current session ID
 * @returns {string|null} The session ID or null
 */
export const getSessionId = () => {
  return localStorage.getItem('session_id');
};

/**
 * Set the session ID
 * @param {string} sessionId - The session ID to store
 */
export const setSessionId = (sessionId) => {
  localStorage.setItem('session_id', sessionId);
};

/**
 * Remove the session ID
 */
export const removeSessionId = () => {
  localStorage.removeItem('session_id');
};

/**
 * Get user's first name from localStorage
 * @returns {string|null}
 */
export const getUserFirstName = () => {
  return localStorage.getItem('userFirstName');
};

/**
 * Get user's internal ID from localStorage
 * @returns {string|null}
 */
export const getUserId = () => {
  return localStorage.getItem('userId');
};

/**
 * Clear all auth-related data from localStorage
 * Called during logout
 */
export const clearAuthData = () => {
  removeToken();
  removeSessionId();
  localStorage.removeItem('selectedProjectId');
};

/**
 * Instructions for Chrome Extension users
 * 
 * To get your Auth0 token for the Chrome extension:
 * 1. Sign in to the web app
 * 2. Open browser DevTools (F12)
 * 3. Go to Application > Local Storage
 * 4. Find "stitch_token" key (email/password login) 
 *    OR the key starting with "@@auth0spajs@@" (Google login)
 * 5. Copy the token value
 * 6. Paste into the Chrome extension settings
 */
