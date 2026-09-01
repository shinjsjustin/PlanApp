'use strict';

const { defineConfig, devices } = require('@playwright/test');

// The E2E harness (spec section 6).
//
// One critical flow, run against the real thing: the built React bundle served
// by the real Express server, talking to a real MySQL schema. That is the whole
// reason this suite exists — everything the unit and component tests can reach
// is already covered there, and everything they cannot (layout, measurement,
// drag-and-drop, the drawn edges) only exists in a real browser.
//
// The server is started on the test database, never the development one. The
// name is asserted in `tests/e2e/database.js` for the same reason the Jest
// helper asserts it: a stray run must not be able to touch real data.

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;

// A CRA production build plus a server boot. Generous, because the build is the
// slow part and a timeout here reads as a mysterious failure rather than a slow
// machine.
const WEB_SERVER_TIMEOUT_MS = 300 * 1000;

module.exports = defineConfig({
    testDir: './tests/e2e',
    // The flow shares one account and one project across its steps, so its
    // assertions are ordered and must not be split across workers.
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    timeout: 90 * 1000,
    expect: { timeout: 10 * 1000 },

    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

    // `REACT_APP_URL` is baked into the bundle at build time, so the build has
    // to be told the port the test server listens on — the checked-in
    // `src/client/.env` points at the development one.
    webServer: {
        command:
            `REACT_APP_URL=${BASE_URL}/api npm run build --prefix src/client && ` +
            `DB_NAME=planapp_test PORT=${PORT} node src/server.js`,
        url: BASE_URL,
        timeout: WEB_SERVER_TIMEOUT_MS,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
