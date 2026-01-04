import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { hasToken } from '../utils/auth';

/**
 * ProtectedRoute component
 * 
 * Wraps routes that require authentication.
 * Checks both:
 * - Auth0 authentication (for social logins)
 * - Custom token (for email/password login)
 */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated: auth0Authenticated, isLoading } = useAuth0();
  
  // Check if user is authenticated via email/password (custom token)
  const hasCustomToken = hasToken();
  
  // User is authenticated if either Auth0 says so OR we have a custom token
  const isAuthenticated = auth0Authenticated || hasCustomToken;

  // Show loading state while Auth0 is checking authentication
  // But if we already have a custom token, we can skip the loading state
  if (isLoading && !hasCustomToken) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#666', fontSize: '14px' }}>Loading...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login/email" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
