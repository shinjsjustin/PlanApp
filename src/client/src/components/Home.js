import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import './Styling/Home.css';

// Public landing page — no auth required.
function Home() {
    const navigate = useNavigate();
    const isSignedIn = Boolean(localStorage.getItem('token'));

    return (
        <div className="Home">
            <header className="Home-header">
                <Navbar />
                <main className="center">
                    <h1 className="Home-title">ShinPlan</h1>
                    <p className="Home-tagline">
                        Plan projects, calendar days and people in one place.
                    </p>

                    <button className="industrial-button" onClick={() => window.location.assign('/about')}>
                        Learn More
                    </button>
                    {isSignedIn ? (
                        <Link className="industrial-button Home-link" to="/projects">Projects</Link>
                    ) : (
                        <button className="industrial-button" onClick={() => navigate('/login')}>
                            Login
                        </button>
                    )}
                </main>
                {/* Plain anchors: Express serves these pages, not React. */}
                <footer className="Home-footer">
                    <a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
                </footer>
            </header>
        </div>
    );
}

export default Home;
