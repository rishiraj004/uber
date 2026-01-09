import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  allow: 'RIDER' | 'CAPTAIN';
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allow, children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    if (role !== allow) {
        return <Navigate to={role==="CAPTAIN" ? '/captain-dashboard' : '/rider-dashboard'} />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;