import React from 'react';
import Logout from './Logout';

const AccessDenied = () => {
    return (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <h1>Access Denied</h1>
            <p>You don't have permission to view this page.</p>
            <Logout />
        </div>
    );
};

export default AccessDenied;
