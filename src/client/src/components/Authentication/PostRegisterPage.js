import React from 'react';
import { useNavigate } from 'react-router-dom';

// Shown after a successful registration.
// New accounts are access_level 0 (pending) until an admin approves them.
const PostRegisterPage = () => {
    const navigate = useNavigate();

    return (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <h1>Registration Successful</h1>
            {/* TODO: Update this message to match your approval flow */}
            <p>Your account has been created. Please wait for an administrator to grant you access.</p>
            <button
                onClick={() => navigate('/')}
                style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
            >
                Go to Home
            </button>
        </div>
    );
};

export default PostRegisterPage;
