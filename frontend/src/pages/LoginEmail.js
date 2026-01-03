import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import appleIcon from '../assets/apple-icon.svg';
import googleIcon from '../assets/google-icon.svg';
import stitchLogo from '../assets/stitch-logo.svg';
import '../App.css';

const LoginEmail = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Basic email validation
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    // Navigate to password step with email in state
    navigate('/login/password', { state: { email } });
  };

  const handleGoogleSignIn = () => {
    setError('Google sign-in is not yet implemented.');
  };

  const handleAppleSignIn = () => {
    setError('Apple sign-in is not yet implemented.');
  };

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
          <button 
            type="button" 
            className="auth-social-button"
            onClick={handleAppleSignIn}
          >
            <img src={appleIcon} alt="" className="auth-social-icon" />
            <span>Continue with Apple ID</span>
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
                placeholder=""
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                className="auth-input"
                required
              />
            </div>
            <button type="submit" className="auth-sign-in-button">Sign In</button>
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

