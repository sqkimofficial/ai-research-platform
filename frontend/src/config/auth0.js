/**
 * Auth0 Configuration
 * 
 * Configuration for Auth0 authentication.
 * Values are loaded from environment variables.
 */

export const auth0Config = {
  domain: process.env.REACT_APP_AUTH0_DOMAIN || 'dev-e0a45vyrmttly5df.us.auth0.com',
  clientId: process.env.REACT_APP_AUTH0_CLIENT_ID || 'itttKkwDovKRteOJ9MZZPa21uNgfPuq0',
  authorizationParams: {
    redirect_uri: window.location.origin + '/callback',
    audience: process.env.REACT_APP_AUTH0_AUDIENCE || 'https://api.stitch.app',
    scope: 'openid profile email'
  },
  // Store tokens in localStorage for persistence across page refreshes
  // This also allows the Chrome extension to access the token
  cacheLocation: 'localstorage',
  // Use refresh tokens for long-lived sessions
  useRefreshTokens: true
};

/**
 * Get the Auth0 domain
 */
export const getAuth0Domain = () => auth0Config.domain;

/**
 * Get the Auth0 client ID
 */
export const getAuth0ClientId = () => auth0Config.clientId;

/**
 * Get the API audience
 */
export const getAuth0Audience = () => auth0Config.authorizationParams.audience;

