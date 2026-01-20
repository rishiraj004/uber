import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  allow: 'RIDER' | 'CAPTAIN' | 'ADMIN' | 'BOTH' | 'ALL';
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allow, children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    // Allow access if allow is 'BOTH' (for shared pages like profile, ride history) or 'ALL'
    if (allow === 'BOTH' || allow === 'ALL') {
        return <>{children}</>;
    }

    if (role !== allow) {
        // Redirect based on role
        if (role === 'ADMIN') {
            return <Navigate to="/admin" replace />;
        }
        return <Navigate to={role === "CAPTAIN" ? '/captain-dashboard' : '/rider-dashboard'} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;