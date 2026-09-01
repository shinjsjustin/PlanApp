import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../Styling/Form.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            // TODO: REACT_APP_URL must be set in src/client/.env
            //   e.g. REACT_APP_URL=http://localhost:3001/api
            const response = await fetch(`${process.env.REACT_APP_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.status === 200) {
                localStorage.setItem('token', data.token);
                navigate('/projects');
            } else if (response.status === 404) {
                setError('No account found with that email.');
            } else if (response.status === 400) {
                setError('Invalid password.');
            } else {
                setError('Server error — please try again.');
            }
        } catch (err) {
            console.error(err);
            setError('Network error — could not reach the server.');
        }
    };

    return (
        <div className="container">
            <h1 className="header">Log In</h1>
            <form className="container-form" onSubmit={handleLogin}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <button type="submit">Log In</button>
                <Link to="/register">Don't have an account? Register</Link>
                <Link to="/">Home</Link>
            </form>
            {error && <p>{error}</p>}
        </div>
    );
};

export default Login;
