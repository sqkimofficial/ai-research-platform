import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { auth0Config } from './config/auth0';
import './design-system.css';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));

/**
 * Auth0Provider wraps the entire app to provide authentication context.
 * 
 * The onRedirectCallback handles navigation after Auth0 login redirect.
 */
root.render(
  <React.StrictMode>
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={auth0Config.authorizationParams}
      cacheLocation={auth0Config.cacheLocation}
      useRefreshTokens={auth0Config.useRefreshTokens}
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
