const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const projectRoutes = require('./routes/projects');
const layerRoutes = require('./routes/layers');
const sequenceRoutes = require('./routes/sequences');
const todoRoutes = require('./routes/todos');
const calendarNotesRoutes = require('./routes/calendarNotes');
const calendarRoutes = require('./routes/calendar');

const isAuth = require('./middleware/isAuth');
const { respond, errorHandler } = require('./middleware/respond');
const requiredEnv = require('./lib/requiredEnv');

dotenv.config();

// Checked here rather than where it is used. `isAuth` and the login route both
// reach for it, and an unset secret turns the first into "every token is
// invalid" and the second into a 500 — two confusing symptoms of one
// misconfiguration, hours after startup. This says so at startup instead.
requiredEnv('JWT_SECRET');

const app = express();

// Allow requests from the React dev server.
// In production the server serves the built React app directly, so CORS
// is only needed during development.
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));

app.use(bodyParser.json());

// ── Public routes (no auth required) ────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Protected routes (JWT required via isAuth middleware) ────────────────────
// All routes mounted after isAuth will require a valid Bearer token.
app.use('/api/user', isAuth, userRoutes);

// ── Resource routes ─────────────────────────────────────────────────────────
// These answer with the `{ success, data, error }` envelope that `respond`
// installs. The auth and user routes above still send bare JSON, which the
// login screen reads directly — migrating them is a separate change.
//
// Everything here must stay ABOVE the static/catch-all block below: the
// `app.get('*')` handler answers every unmatched GET with the React shell, so
// anything mounted after it is unreachable.
app.use('/api/projects', isAuth, respond, projectRoutes);
app.use('/api/layers', isAuth, respond, layerRoutes);
app.use('/api/sequences', isAuth, respond, sequenceRoutes);
app.use('/api/todos', isAuth, respond, todoRoutes);
// The more specific mount comes first, so `/api/calendar/notes` is not
// swallowed by the calendar router's own `/:id`-shaped routes below it.
app.use('/api/calendar/notes', isAuth, respond, calendarNotesRoutes);
app.use('/api/calendar', isAuth, respond, calendarRoutes);

// Terminal error handler for the resource routes above.
app.use(errorHandler);

// ── Serve the built React app in production ──────────────────────────────────
// During development `npm run dev` runs the React dev server separately.
app.use(express.static(path.join(__dirname, 'client/build')));

// Catch-all: send any unmatched GET to the React app so client-side routing works.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    console.error(`404: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Endpoint not found' });
});

// Started only when run directly, so tests can require the app and drive it
// with supertest without binding a port.
if (require.main === module) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
