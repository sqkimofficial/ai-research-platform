import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import ProtectedRoute from './components/ProtectedRoute';
import LoginEmail from './pages/LoginEmail';
import LoginPassword from './pages/LoginPassword';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import Workspace from './pages/Workspace';

function App() {
  const { isAuthenticated, isLoading } = useAuth0();

  // Show nothing while Auth0 is initializing
  if (isLoading) {
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

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth callback route - handles Auth0 redirect */}
        <Route path="/callback" element={<AuthCallback />} />
        
        {/* Public routes */}
        <Route path="/login/email" element={<LoginEmail />} />
        <Route path="/login/password" element={<LoginPassword />} />
        <Route path="/login" element={<Navigate to="/login/email" replace />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes */}
        <Route
          path="/project/:projectId/workspace"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:projectId/workspace/:sessionId"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />
        {/* Workspace route without projectId - will show project selector */}
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />

        {/* Redirects */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate
                to={
                  localStorage.getItem('selectedProjectId')
                    ? `/project/${localStorage.getItem('selectedProjectId')}/workspace`
                    : '/workspace'
                }
                replace
              />
            ) : (
              <Navigate to="/login/email" replace />
            )
          }
        />
        <Route
          path="*"
          element={
            isAuthenticated ? (
              <Navigate
                to={
                  localStorage.getItem('selectedProjectId')
                    ? `/project/${localStorage.getItem('selectedProjectId')}/workspace`
                    : '/workspace'
                }
                replace
              />
            ) : (
              <Navigate to="/login/email" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
