import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Styling/Navbar.css';
import './Styling/Home.css';

// Navbar renders the top-right profile icon and a slide-down panel with
// account links and a logout button. Add global nav links here if needed.
const Navbar = () => {
    const [showPanel, setShowPanel] = useState(false);
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const token = localStorage.getItem('token');

    return (
        <>
            {token && (
                <div
                    className="profile-icon"
                    onClick={() => setShowPanel(prev => !prev)}
                    title="Account"
                >
                    {/* TODO: Replace with your logo/profile SVG or an <img> */}
                    <svg viewBox="0 0 45.532 45.532" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M22.766 0C10.194 0 0 10.193 0 22.766s10.193 22.766 22.766 22.766
                            c12.574 0 22.766-10.192 22.766-22.766S35.34 0 22.766 0zm0 6.808
                            a7.53 7.53 0 1 1 0 15.06 7.53 7.53 0 0 1 0-15.06zm-.005 32.771
                            c-4.149 0-7.949-1.511-10.88-4.012a2.999 2.999 0 0 1-1.126-2.439
                            c0-4.217 3.413-7.592 7.631-7.592h8.762c4.219 0 7.619 3.375 7.619 7.592
                            a3 3 0 0 1-1.125 2.438c-2.931 2.501-6.732 4.013-10.881 4.013z"/>
                    </svg>
                </div>
            )}

            {showPanel && token && (
                <div className="profile-background">
                    <div className="profile-panel">
                        {/* TODO: Add user name/email from decoded JWT if desired */}
                        <button
                            className="industrial-button"
                            onClick={() => { navigate('/dashboard'); setShowPanel(false); }}
                        >
                            Dashboard
                        </button>
                        <button className="industrial-button" onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default Navbar;
