import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '../utils/auth';

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const token = getToken();

  if (!token) {
    // Redirect to login with return path
    return <Navigate to="/login/email" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;

