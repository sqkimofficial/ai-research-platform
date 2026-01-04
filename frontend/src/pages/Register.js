import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authAPI } from '../services/api';
import googleIcon from '../assets/google-icon.svg';
import stitchLogo from '../assets/stitch-logo.svg';
import '../App.css';

/**
 * Register component - Account creation page
 * 
 * - Custom registration form (calls our backend)
 * - Social login buttons redirect to Auth0
 */
const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { loginWithRedirect, isAuthenticated, isLoading: auth0Loading } = useAuth0();

  // If already authenticated via Auth0 (social login), redirect to workspace
  useEffect(() => {
    if (isAuthenticated && !auth0Loading) {
      const savedProjectId = localStorage.getItem('selectedProjectId');
      if (savedProjectId) {
        navigate(`/project/${savedProjectId}/workspace`);
      } else {
        navigate('/workspace');
      }
    }
  }, [isAuthenticated, auth0Loading, navigate]);

  /**
   * Handle input change
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  /**
   * Handle registration form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!formData.password) {
      setError('Please enter a password');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.register(
        formData.email.trim(),
        formData.password,
        formData.firstName.trim(),
        formData.lastName.trim()
      );

      // Registration successful - redirect to login
      navigate('/login/email', { 
        state: { 
          message: 'Account created successfully! Please sign in.',
          email: formData.email.trim()
        } 
      });
    } catch (err) {
      console.error('Registration error:', err);
      const errorMessage = err.response?.data?.error || 'Registration failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Google Sign-Up via Auth0
   */
  const handleGoogleSignUp = () => {
    loginWithRedirect({
      authorizationParams: {
        connection: 'google-oauth2'
      }
    });
  };

  // Show loading state while Auth0 initializes
  if (auth0Loading) {
    return (
      <div className="auth-container">
        <div className="auth-top-section">
          <div className="auth-logo-wrapper">
            <img src={stitchLogo} alt="Stitch" className="auth-logo" />
          </div>
        </div>
        <div className="auth-main-section auth-main-section--register">
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
      
      <div className="auth-main-section auth-main-section--register">
        <div className="auth-welcome-section">
          <h1 className="auth-welcome-title">
            <span>Welcome </span>
            <span className="lowercase">to</span>
            <span> Stitch</span>
          </h1>
          <p className="auth-subtitle">Create your account to get started</p>
        </div>
        
        <div className="auth-social-buttons-container">
          <button 
            type="button" 
            className="auth-social-button"
            onClick={handleGoogleSignUp}
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
          <form onSubmit={handleSubmit} className="auth-form-wrapper">
            {error && <div className="auth-error-text">{error}</div>}
            
            <div className="auth-form-row">
              <div className="auth-form-group auth-form-group-half">
                <label htmlFor="firstName" className="auth-form-label">First Name</label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder=""
                  value={formData.firstName}
                  onChange={handleChange}
                  className="auth-input"
                  autoComplete="given-name"
                  disabled={isLoading}
                />
              </div>
              <div className="auth-form-group auth-form-group-half">
                <label htmlFor="lastName" className="auth-form-label">Last Name</label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder=""
                  value={formData.lastName}
                  onChange={handleChange}
                  className="auth-input"
                  autoComplete="family-name"
                  disabled={isLoading}
                />
              </div>
            </div>
            
            <div className="auth-form-group">
              <label htmlFor="email" className="auth-form-label">Email ID</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder=""
                value={formData.email}
                onChange={handleChange}
                className="auth-input"
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="auth-form-group">
              <label htmlFor="password" className="auth-form-label">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder=""
                value={formData.password}
                onChange={handleChange}
                className="auth-input"
                autoComplete="new-password"
                required
                disabled={isLoading}
              />
            </div>
            
            <button 
              type="submit" 
              className="auth-sign-in-button"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          <span className="auth-footer-text">
            Already have an account?{' '}
          </span>
          <a 
            href="/login/email"
            className="auth-create-account-link"
            onClick={(e) => {
              e.preventDefault();
              navigate('/login/email');
            }}
          >
            Sign In
          </a>
        </div>
      </div>
    </div>
  );
};

export default Register;
