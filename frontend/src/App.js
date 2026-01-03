import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import LoginEmail from './pages/LoginEmail';
import LoginPassword from './pages/LoginPassword';
import Register from './pages/Register';
import Workspace from './pages/Workspace';
import { getToken } from './utils/auth';

function App() {
  // Check if user is authenticated on app load
    const token = getToken();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login/email" element={<LoginEmail />} />
        <Route path="/login/password" element={<LoginPassword />} />
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
            token ? (
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
          path="/login"
          element={<Navigate to="/login/email" replace />}
        />
        <Route
          path="*"
          element={
            token ? (
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
