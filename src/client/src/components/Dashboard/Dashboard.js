import React, { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import Navbar from '../Navbar';
import '../Styling/Home.css';

// Protected home page — only reachable after a valid JWT login.
// The ProtectedRoute wrapper in routes.js enforces this.
const Dashboard = () => {
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Decode the JWT locally to get basic info without a round-trip.
        // For sensitive data (e.g. updated profile), always fetch from /api/user/me.
        try {
            const decoded = jwtDecode(token);
            setUser(decoded);
        } catch {
            setError('Failed to decode session token.');
        }
    }, []);

    // Example: fetch full profile from the protected API endpoint.
    // Uncomment when you need server-side user data.
    //
    // useEffect(() => {
    //     const token = localStorage.getItem('token');
    //     fetch(`${process.env.REACT_APP_URL}/user/me`, {
    //         headers: { Authorization: `Bearer ${token}` },
    //     })
    //         .then(res => res.json())
    //         .then(data => setUser(data))
    //         .catch(() => setError('Failed to load profile.'));
    // }, []);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
            <Navbar />

            <div style={{
                maxWidth: '800px',
                margin: '80px auto',
                padding: '40px',
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
            }}>
                <h1 style={{ color: 'var(--color-primary)', marginTop: 0 }}>
                    Dashboard
                </h1>

                {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

                {user ? (
                    <div>
                        {/* TODO: Replace with real dashboard content */}
                        <p><strong>Email:</strong> {user.email}</p>
                        <p><strong>Access Level:</strong> {user.access}</p>

                        <hr style={{ margin: '24px 0', borderColor: 'var(--border)' }} />

                        <h2>Quick Links</h2>
                        {/* TODO: Add links to your main feature pages */}
                        <p style={{ color: 'var(--text-muted)' }}>
                            Add your feature pages here — job list, part catalog, requests, etc.
                        </p>
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
