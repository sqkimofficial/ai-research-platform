import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import googleIcon from '../assets/google-icon.svg';
import stitchLogo from '../assets/stitch-logo.svg';
import '../App.css';

/**
 * LoginEmail component - Email entry page
 * 
 * - Custom email form for embedded login (calls our backend)
 * - Social login buttons redirect to Auth0
 */
const LoginEmail = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  // Check for extension parameter in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const extensionId = urlParams.get('extension');
    const provider = urlParams.get('provider');
    
    if (extensionId) {
      // Store extension ID for later use
      sessionStorage.setItem('chrome_extension_id', extensionId);
      
      // Auto-trigger Google login if provider is google
      if (provider === 'google' && !isLoading) {
        handleGoogleSignIn();
      }
    }
  }, [location, isLoading]);

  // Check for error from callback
  useEffect(() => {
    if (location.state?.error) {
      setError(location.state.error);
    }
  }, [location]);

  // If already authenticated via Auth0 (social login), redirect to workspace
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const extensionId = sessionStorage.getItem('chrome_extension_id');
      if (extensionId) {
        // Don't redirect, wait for AuthCallback to handle extension token
        return;
      }
      
      const savedProjectId = localStorage.getItem('selectedProjectId');
      if (savedProjectId) {
        navigate(`/project/${savedProjectId}/workspace`);
      } else {
        navigate('/workspace');
      }
    }
  }, [isAuthenticated, isLoading, navigate]);

  /**
   * Handle email form submission - go to password page
   */
  const handleEmailSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    
    // Navigate to password page with email
    navigate('/login/password', { state: { email: email.trim() } });
  };

  /**
   * Handle Google Sign-In via Auth0
   */
  const handleGoogleSignIn = () => {
    loginWithRedirect({
      authorizationParams: {
        connection: 'google-oauth2'
      }
    });
  };

  // Show loading state while Auth0 initializes
  if (isLoading) {
    return (
      <div className="auth-container">
        <div className="auth-top-section">
          <div className="auth-logo-wrapper">
            <img src={stitchLogo} alt="Stitch" className="auth-logo" />
          </div>
        </div>
        <div className="auth-main-section">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              border: '4px solid #e0e0e0',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }} />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-top-section">
        <div className="auth-logo-wrapper">
          <img src={stitchLogo} alt="Stitch" className="auth-logo" />
        </div>
      </div>
      
      <div className="auth-main-section">
        <div className="auth-welcome-section">
          <h1 className="auth-welcome-title">
            <span>Welcome </span>
            <span className="lowercase">to</span>
            <span> Stitch</span>
          </h1>
          <p className="auth-subtitle">Sign In to access your dashboard</p>
        </div>
        
        <div className="auth-social-buttons-container">
          <button 
            type="button" 
            className="auth-social-button"
            onClick={handleGoogleSignIn}
          >
            <img src={googleIcon} alt="" className="auth-social-icon" />
            <span>Continue with Google</span>
          </button>
        </div>
        
        <div className="auth-separator">
          <div className="auth-separator-line"></div>
          <span className="auth-separator-text">or</span>
          <div className="auth-separator-line"></div>
        </div>
        
        <div className="auth-form-container">
          <form onSubmit={handleEmailSubmit} className="auth-form-wrapper">
            {error && <div className="auth-error-text">{error}</div>}
            <div className="auth-form-group">
              <label htmlFor="email" className="auth-form-label">Email ID</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className="auth-input"
                autoComplete="email"
                autoFocus
              />
            </div>
            <button type="submit" className="auth-sign-in-button">
              Sign In
            </button>
          </form>
        </div>

        <div className="auth-footer">
          <span className="auth-footer-text">
            Don't have an account?{' '}
          </span>
          <a 
            href="/register"
            className="auth-create-account-link"
            onClick={(e) => {
              e.preventDefault();
              navigate('/register');
            }}
          >
            Create Account
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginEmail;
