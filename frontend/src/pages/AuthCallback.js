import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import stitchLogo from '../assets/stitch-logo.svg';
import '../App.css';

/**
 * AuthCallback component handles the redirect from Auth0 after authentication.
 * 
 * This component:
 * 1. Waits for Auth0 to finish processing the callback
 * 2. Gets the access token
 * 3. Syncs the user to the backend (creates/updates user in MongoDB)
 * 4. Stores user info in localStorage
 * 5. Redirects to the workspace
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const { 
    isAuthenticated, 
    isLoading, 
    getAccessTokenSilently, 
    user,
    error: auth0Error 
  } = useAuth0();
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const syncUserToBackend = async () => {
      if (isLoading) return;
      
      if (auth0Error) {
        setError(auth0Error.message || 'Authentication failed');
        return;
      }

      if (!isAuthenticated) {
        // Not authenticated, redirect to login
        navigate('/login/email');
        return;
      }

      try {
        setSyncing(true);
        
        // Get the access token from Auth0
        const accessToken = await getAccessTokenSilently();
        
        // Sync user to backend
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
        const response = await fetch(`${apiUrl}/api/auth/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to sync user');
        }

        const userData = await response.json();
        
        // Store user info in localStorage for easy access
        if (userData.first_name) {
          localStorage.setItem('userFirstName', userData.first_name);
        }
        if (userData.user_id) {
          localStorage.setItem('userId', userData.user_id);
        }

        console.log('User synced successfully:', userData);

        // Check if this is a Chrome extension request
        const extensionId = sessionStorage.getItem('chrome_extension_id');
        if (extensionId) {
          // Store token in localStorage with extension ID - extension will read it
          localStorage.setItem(`extension_auth_token_${extensionId}`, accessToken);
          localStorage.setItem(`extension_auth_token_time_${extensionId}`, Date.now().toString());
          console.log('Token stored for extension to retrieve:', extensionId);
          
          // Show success message and try to notify extension
          try {
            // Try to send message to extension if it's listening
            // eslint-disable-next-line no-undef
            if (typeof chrome !== 'undefined' && chrome.runtime) {
              try {
                // eslint-disable-next-line no-undef
                chrome.runtime.sendMessage(extensionId, {
                  type: 'GOOGLE_AUTH_COMPLETE',
                  token: accessToken
                }, (response) => {
                  // eslint-disable-next-line no-undef
                  if (chrome.runtime.lastError) {
                    console.log('Extension not listening, token stored in localStorage');
                  }
                });
              } catch (e) {
                console.log('Could not send message to extension, token stored in localStorage');
              }
            }
          } catch (e) {
            console.log('Could not communicate with extension, token stored in localStorage');
          }
          
          // Show success message
          setTimeout(() => {
            alert('Authentication successful! You can now close this tab and return to the extension. The extension will automatically detect your sign-in.');
            // Try to close the tab (may not work if not opened by script)
            setTimeout(() => {
              window.close();
            }, 500);
          }, 500);
          
          return; // Don't redirect to workspace
        }

        // Normal flow: Redirect to workspace
        const savedProjectId = localStorage.getItem('selectedProjectId');
        if (savedProjectId) {
          navigate(`/project/${savedProjectId}/workspace`);
        } else {
          navigate('/workspace');
        }
        
      } catch (err) {
        console.error('Error syncing user:', err);
        setError(err.message || 'Failed to complete authentication');
        setSyncing(false);
      }
    };

    syncUserToBackend();
  }, [isAuthenticated, isLoading, auth0Error, getAccessTokenSilently, navigate, user]);

  return (
    <div className="auth-container">
      <div className="auth-top-section">
        <div className="auth-logo-wrapper">
          <img src={stitchLogo} alt="Stitch" className="auth-logo" />
        </div>
      </div>
      
      <div className="auth-main-section">
        <div className="auth-welcome-section">
          {error ? (
            <>
              <h1 className="auth-welcome-title">
                <span>Authentication Error</span>
              </h1>
              <p className="auth-subtitle" style={{ color: '#ef4444' }}>{error}</p>
              <button 
                onClick={() => navigate('/login/email')}
                className="auth-sign-in-button"
                style={{ marginTop: '24px' }}
              >
                Back to Login
              </button>
            </>
          ) : (
            <>
              <h1 className="auth-welcome-title">
                <span>{syncing ? 'Setting up' : 'Authenticating'}...</span>
              </h1>
              <p className="auth-subtitle">
                {syncing ? 'Preparing your workspace' : 'Please wait while we complete your sign in'}
              </p>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                border: '4px solid #e0e0e0',
                borderTop: '4px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '32px auto'
              }} />
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;

