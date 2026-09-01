const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');

const router = express.Router();

// POST /api/auth/register
// Creates a new user account.
// Body: { name, email, password }
// Returns 201 on success, 409 if email already exists.
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email, and password are required' });
    }

    try {
        // Check for existing account
        const [rows] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // TODO: Adjust columns to match your schema.
        //   access_level: new registrations default to 1 (approved).
        const [result] = await db.execute(
            `INSERT INTO users (name, email, password, access_level) VALUES (?, ?, ?, ?)`,
            [name, email, hashedPassword, 1]
        );

        res.status(201).json({ id: result.insertId, name, email });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'An error occurred during registration' });
    }
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
