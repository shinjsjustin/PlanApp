import React from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

// Wraps a route so it is only accessible when the user holds a valid JWT
// with a sufficient access level.
//
// Usage in routes.js:
//   { path: "/dashboard", element: <ProtectedRoute><Dashboard /></ProtectedRoute> }
//   { path: "/admin", element: <ProtectedRoute requiredAccessLevel={2}><Admin /></ProtectedRoute> }
//
// access_level values (customize to match your schema):
//   0 — registered but pending approval
//   1 — standard user
//   2 — admin
//   3 — super-admin
const ProtectedRoute = ({ children, requiredAccessLevel = 1 }) => {
    const token = localStorage.getItem('token');

    if (!token) {
        return <Navigate to="/login" />;
    }

    try {
        const decoded = jwtDecode(token);

        // Expired or missing exp — treat as unauthenticated rather than trusting a stale token
        if (!decoded.exp || decoded.exp * 1000 < Date.now()) {
            localStorage.removeItem('token');
            return <Navigate to="/login" />;
        }

        if (decoded.access < requiredAccessLevel) {
            return <Navigate to="/access-denied" />;
        }
    } catch {
        // Malformed token — treat as unauthenticated
        localStorage.removeItem('token');
        return <Navigate to="/login" />;
    }

    return children;
};

export default ProtectedRoute;
