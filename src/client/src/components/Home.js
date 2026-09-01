import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import './Styling/Home.css';

// Public landing page — no auth required.
// TODO: Replace placeholder text and logo with real brand assets.
function Home() {
    const navigate = useNavigate();

    return (
        <div className="Home">
            <header className="Home-header">
                <Navbar />
                <div className="center">
                    {/* TODO: Replace with <img src={logo} className="Home-logo" alt="logo" /> */}
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#fff', marginBottom: '2rem' }}>
                        New Project
                    </div>

                    {/* TODO: Update tagline */}
                    <p style={{ color: '#aaa', marginBottom: '2rem', fontSize: '1.1rem' }}>
                        Tech Stack: React, Node.js, Express, MySQL
                    </p>

                    <button className="industrial-button" onClick={() => navigate('/about')}>
                        Learn More
                    </button>
                    <button className="industrial-button" onClick={() => navigate('/login')}>
                        Login
                    </button>
                    <button className="industrial-button" onClick={() => navigate('/register')}>
                        Register
                    </button>
                </div>
            </header>
        </div>
    );
}

export default Home;
