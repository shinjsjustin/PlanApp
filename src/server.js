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
const calendarEventsRoutes = require('./routes/calendarEvents');
const calendarExportRoutes = require('./routes/calendarExport');
const calendarRoutes = require('./routes/calendar');
const googleRoutes = require('./routes/google');
const googleCallbackRoutes = require('./routes/googleCallback');
const bourneRoutes = require('./routes/bourne');
const thoughtsRoutes = require('./routes/thoughts');
const placesRoutes = require('./routes/places');
const peopleRoutes = require('./routes/people');

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
// Likewise for events, which would otherwise reach the calendar router first.
app.use('/api/calendar/events', isAuth, respond, calendarEventsRoutes);
// And for export, for the same reason.
app.use('/api/calendar/export', isAuth, respond, calendarExportRoutes);
app.use('/api/calendar', isAuth, respond, calendarRoutes);
// The callback is public because Google's redirect carries no Bearer token; the
// signed `state` it echoes back identifies the user instead. It is mounted
// first so the protected router below never sees it.
app.use('/api/google', googleCallbackRoutes);
app.use('/api/google', isAuth, respond, googleRoutes);
// Bourne's read-only Google routes.
app.use('/api/bourne', isAuth, respond, bourneRoutes);
app.use('/api/thoughts', isAuth, respond, thoughtsRoutes);
app.use('/api/places', isAuth, respond, placesRoutes);
app.use('/api/people', isAuth, respond, peopleRoutes);

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
