'use strict';

const { defineConfig, devices } = require('@playwright/test');

// The visual suite: screenshots and layout checks at three viewports. It has its
// own command (`npm run test:visual`) and is kept out of `test:all` and CI.
//
// Two modes:
//  - Live: set VISUAL_BASE_URL to point at an already running deployment. No
//    web server is started.
//  - Local: with VISUAL_BASE_URL unset, the client is built and src/server.js is
//    started on the test database at port 3102.
//
// The `iphone` project uses WebKit, which needs `npx playwright install webkit`
// (needs network, once per machine).

const PORT = 3102;
const LOCAL_URL = `http://localhost:${PORT}`;
const LIVE_URL = process.env.VISUAL_BASE_URL;

const WEB_SERVER_TIMEOUT_MS = 300 * 1000;

module.exports = defineConfig({
    testDir: './tests/visual',
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],

    use: {
        baseURL: LIVE_URL || LOCAL_URL,
    },

    projects: [
        {
            name: 'desktop-1440',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
        {
            name: 'laptop-1036',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1036, height: 800 } },
        },
        {
            name: 'iphone',
            use: {
                browserName: 'webkit',
                viewport: { width: 393, height: 852 },
                deviceScaleFactor: 3,
                isMobile: true,
                hasTouch: true,
            },
        },
    ],

    // REACT_APP_URL is baked in at build time, so it must name this port.
    ...(LIVE_URL
        ? {}
        : {
              webServer: {
                  command:
                      `REACT_APP_URL=${LOCAL_URL}/api npm run build --prefix src/client && ` +
                      `DB_NAME=planapp_test PORT=${PORT} node src/server.js`,
                  url: LOCAL_URL,
                  timeout: WEB_SERVER_TIMEOUT_MS,
                  reuseExistingServer: true,
                  stdout: 'pipe',
                  stderr: 'pipe',
              },
          }),
});
