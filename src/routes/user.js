const express = require('express');
const db = require('../db/db');

const router = express.Router();

// GET /api/user/me
// Returns the profile of the currently authenticated user.
// req.user is populated by the isAuth middleware before this route runs.
router.get('/me', async (req, res) => {
    try {
        // TODO: Adjust selected columns to match your schema
        const [rows] = await db.execute(
            'SELECT id, name, email, access_level FROM users WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json(rows[0]);
    } catch (err) {
        console.error('GET /me error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// TODO: Add more protected user routes here following this same pattern:
//
//   router.get('/some-protected-resource', async (req, res) => {
//       const userId = req.user.id;  // always available after isAuth
//       ...
//   });

module.exports = router;
