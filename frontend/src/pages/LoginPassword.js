import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI } from '../services/api';
import { setToken } from '../utils/auth';
import stitchLogo from '../assets/stitch-logo.svg';
import '../App.css';

/**
 * LoginPassword component - Password entry page
 * 
 * - Receives email from LoginEmail page
 * - Submits credentials to backend for Auth0 password grant
 */
const LoginPassword = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get email from navigation state
  const email = location.state?.email;

  // Redirect to email page if no email provided
  useEffect(() => {
    if (!email) {
      navigate('/login/email');
    }
  }, [email, navigate]);

  /**
   * Handle login form submission
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authAPI.login(email, password);
      
      // Store token
      setToken(response.data.token);
      
      // Store user first name for display
      if (response.data.first_name) {
        localStorage.setItem('userFirstName', response.data.first_name);
      }
      
      // Navigate to workspace
      const savedProjectId = localStorage.getItem('selectedProjectId');
      if (savedProjectId) {
        navigate(`/project/${savedProjectId}/workspace`);
      } else {
        navigate('/workspace');
      }
    } catch (err) {
      console.error('Login error:', err);
      const errorMessage = err.response?.data?.error || 'Login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle "Forgot Password" click
   */
  const handleForgotPassword = (e) => {
    e.preventDefault();
    // TODO: Implement password reset via Auth0
    alert('Password reset will be available soon. Please contact support if you need help accessing your account.');
  };

  if (!email) {
    return null; // Will redirect
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
          <h1 className="auth-welcome-title" style={{ textTransform: 'capitalize' }}>
            Enter Your Password
          </h1>
          <p className="auth-subtitle">
            Signing in as {email}{' '}
            <a 
              href="/login/email"
              className="auth-footer-link"
              onClick={(e) => {
                e.preventDefault();
                navigate('/login/email');
              }}
            >
              Change email
            </a>
          </p>
        </div>
        
        <div className="auth-form-container">
          <form onSubmit={handleLogin} className="auth-form-wrapper">
            {error && <div className="auth-error-text">{error}</div>}
            
            <div className="auth-form-group">
              <div className="auth-label-row">
                <label htmlFor="password" className="auth-form-label">Password</label>
                <a 
                  href="/forgot-password"
                  onClick={handleForgotPassword}
                  className="auth-forgot-link"
                >
                  Forgot Password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                placeholder=""
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="auth-input"
                autoComplete="current-password"
                autoFocus
                disabled={isLoading}
              />
            </div>
            
            <button 
              type="submit" 
              className="auth-sign-in-button"
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
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

export default LoginPassword;

