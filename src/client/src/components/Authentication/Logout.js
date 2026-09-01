import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../Styling/Home.css';

const Logout = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/');
    };

    return (
        <button className="industrial-button" onClick={handleLogout}>
            Logout
        </button>
    );
};

export default Logout;
