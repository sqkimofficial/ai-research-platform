/**
 * Auth utilities for Chrome Extension OAuth flow with Auth0
 * Uses PKCE (Proof Key for Code Exchange) for secure authentication
 */

// Auth0 Configuration
const AUTH0_CONFIG = {
  domain: 'dev-e0a45vyrmttly5df.us.auth0.com',
  clientId: 'itttKkwDovKRteOJ9MZZPa21uNgfPuq0',
  audience: 'https://api.stitch.app',
  scope: 'openid profile email'
};

/**
 * Generate a random string for PKCE
 */
function generateRandomString(length = 43) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

/**
 * Generate code verifier and code challenge for PKCE
 */
async function generatePKCE() {
  const codeVerifier = generateRandomString(128);
  
  // Hash the code verifier using SHA256
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  // Base64 URL encode the hash
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return {
    codeVerifier,
    codeChallenge: base64
  };
}

/**
 * Get the redirect URI for Chrome extension
 * Chrome automatically assigns this format
 */
function getRedirectUri() {
  return chrome.identity.getRedirectURL();
}

/**
 * Build Auth0 authorization URL with PKCE
 */
async function buildAuthUrl(connection = 'google-oauth2') {
  const pkce = await generatePKCE();
  
  // Store code verifier for later use
  await chrome.storage.local.set({ 
    pkce_code_verifier: pkce.codeVerifier,
    pkce_timestamp: Date.now()
  });
  
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: AUTH0_CONFIG.clientId,
    redirect_uri: redirectUri,
    scope: AUTH0_CONFIG.scope,
    audience: AUTH0_CONFIG.audience,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    connection: connection
  });
  
  return `https://${AUTH0_CONFIG.domain}/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(authorizationCode) {
  const { pkce_code_verifier } = await chrome.storage.local.get(['pkce_code_verifier']);
  
  if (!pkce_code_verifier) {
    throw new Error('PKCE code verifier not found');
  }
  
  const redirectUri = getRedirectUri();
  
  const response = await fetch(`https://${AUTH0_CONFIG.domain}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: AUTH0_CONFIG.clientId,
      code: authorizationCode,
      redirect_uri: redirectUri,
      code_verifier: pkce_code_verifier
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.error || 'Token exchange failed');
  }
  
  const data = await response.json();
  
  // Clean up PKCE data
  await chrome.storage.local.remove(['pkce_code_verifier', 'pkce_timestamp']);
  
  return data.access_token;
}

/**
 * Extract authorization code from redirect URL
 */
function extractCodeFromUrl(redirectUrl) {
  try {
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    
    if (error) {
      const errorDescription = url.searchParams.get('error_description');
      throw new Error(errorDescription || error);
    }
    
    if (!code) {
      throw new Error('No authorization code in redirect URL');
    }
    
    return code;
  } catch (error) {
    throw new Error(`Failed to parse redirect URL: ${error.message}`);
  }
}

/**
 * Initiate Google OAuth flow using Chrome Identity API
 */
async function initiateGoogleAuth() {
  try {
    // Build authorization URL
    const authUrl = await buildAuthUrl('google-oauth2');
    
    // Launch OAuth flow
    const redirectUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, (callbackUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!callbackUrl) {
          reject(new Error('Authentication cancelled'));
        } else {
          resolve(callbackUrl);
        }
      });
    });
    
    // Extract authorization code
    const code = extractCodeFromUrl(redirectUrl);
    
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);
    
    return accessToken;
    
  } catch (error) {
    console.error('Google auth error:', error);
    throw error;
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initiateGoogleAuth,
    getRedirectUri
  };
}

