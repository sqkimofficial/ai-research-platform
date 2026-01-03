import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { setToken } from '../utils/auth';
import stitchLogo from '../assets/stitch-logo.svg';
import '../App.css';

const Register = () => {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    try {
      // Use email as username for now (backend expects username)
      await authAPI.register(email, password, firstName, lastName);
      // Auto-login after registration
      const response = await authAPI.login(email, password);
      setToken(response.data.token);
      // Store user first name for account display
      if (response.data.first_name) {
        localStorage.setItem('userFirstName', response.data.first_name);
      }
      // Navigate to workspace (will show project selector if needed)
      const savedProjectId = localStorage.getItem('selectedProjectId');
      if (savedProjectId) {
        navigate(`/project/${savedProjectId}/workspace`);
      } else {
        // Navigate to workspace route without projectId - will show project selector
        navigate('/workspace');
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed. Please try again.');
    }
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
        
        <div className="auth-form-container">
          <form onSubmit={handleRegister} className="auth-form-wrapper">
            {error && <div className="auth-error-text">{error}</div>}
            <div className="auth-form-group">
              <label htmlFor="register-email" className="auth-form-label">Email ID</label>
              <input
                id="register-email"
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
            <div className="auth-form-group">
              <label htmlFor="register-first-name" className="auth-form-label">First Name</label>
              <input
                id="register-first-name"
                type="text"
                placeholder=""
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setError('');
                }}
                className="auth-input"
                required
              />
            </div>
            <div className="auth-form-group">
              <label htmlFor="register-last-name" className="auth-form-label">Last Name</label>
              <input
                id="register-last-name"
                type="text"
                placeholder=""
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  setError('');
                }}
                className="auth-input"
                required
              />
            </div>
            <div className="auth-form-group">
              <label htmlFor="register-password" className="auth-form-label">Password</label>
              <div className="auth-password-wrapper">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  placeholder=""
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="auth-input"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 3.75C5.83333 3.75 2.275 6.34167 0.833333 10C2.275 13.6583 5.83333 16.25 10 16.25C14.1667 16.25 17.725 13.6583 19.1667 10C17.725 6.34167 14.1667 3.75 10 3.75ZM10 14.1667C7.7 14.1667 5.83333 12.3 5.83333 10C5.83333 7.7 7.7 5.83333 10 5.83333C12.3 5.83333 14.1667 7.7 14.1667 10C14.1667 12.3 12.3 14.1667 10 14.1667ZM10 7.5C8.61667 7.5 7.5 8.61667 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C11.3833 12.5 12.5 11.3833 12.5 10C12.5 8.61667 11.3833 7.5 10 7.5Z" fill="rgba(0,0,0,0.5)"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 2.5L17.5 17.5M8.33333 8.33333C7.89167 8.775 7.5 9.375 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C10.625 12.5 11.225 12.1083 11.6667 11.6667M5.83333 5.83333C4.25 7.08333 3.125 8.45833 2.5 10C3.94167 13.6583 7.5 16.25 11.6667 16.25C12.9167 16.25 14.0833 15.9167 15.0833 15.4167L11.6667 12M2.5 10C3.94167 6.34167 7.5 3.75 11.6667 3.75C13.0833 3.75 14.375 4.16667 15.4167 4.75L12.5 7.66667" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="auth-form-group">
              <label htmlFor="register-confirm-password" className="auth-form-label">Confirm Password</label>
              <div className="auth-password-wrapper">
                <input
                  id="register-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder=""
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  className="auth-input"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 3.75C5.83333 3.75 2.275 6.34167 0.833333 10C2.275 13.6583 5.83333 16.25 10 16.25C14.1667 16.25 17.725 13.6583 19.1667 10C17.725 6.34167 14.1667 3.75 10 3.75ZM10 14.1667C7.7 14.1667 5.83333 12.3 5.83333 10C5.83333 7.7 7.7 5.83333 10 5.83333C12.3 5.83333 14.1667 7.7 14.1667 10C14.1667 12.3 12.3 14.1667 10 14.1667ZM10 7.5C8.61667 7.5 7.5 8.61667 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C11.3833 12.5 12.5 11.3833 12.5 10C12.5 8.61667 11.3833 7.5 10 7.5Z" fill="rgba(0,0,0,0.5)"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 2.5L17.5 17.5M8.33333 8.33333C7.89167 8.775 7.5 9.375 7.5 10C7.5 11.3833 8.61667 12.5 10 12.5C10.625 12.5 11.225 12.1083 11.6667 11.6667M5.83333 5.83333C4.25 7.08333 3.125 8.45833 2.5 10C3.94167 13.6583 7.5 16.25 11.6667 16.25C12.9167 16.25 14.0833 15.9167 15.0833 15.4167L11.6667 12M2.5 10C3.94167 6.34167 7.5 3.75 11.6667 3.75C13.0833 3.75 14.375 4.16667 15.4167 4.75L12.5 7.66667" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-sign-in-button">Create Account</button>
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

