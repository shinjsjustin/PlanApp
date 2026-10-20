const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');

const router = express.Router();

// POST /api/auth/register
// Signup is closed: accounts are created by hand in the database.
router.post('/register', (req, res) => {
    res.status(403).json({ error: 'Signup is closed. ShinPlan is invitation only.' });
});

// POST /api/auth/login
// Validates credentials and returns a signed JWT.
// Body: { email, password }
// Returns 200 + { token } on success.
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No account found with that email' });
        }

        const user = rows[0];

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        // TODO: JWT_SECRET must be set in .env
        // TODO: Add/remove JWT payload fields to match your user schema
        const token = jwt.sign(
            { email: user.email, id: user.id, access: user.access_level },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({ message: 'Login successful', token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'An error occurred during login' });
    }
});

module.exports = router;
