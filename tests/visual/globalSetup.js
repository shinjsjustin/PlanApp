'use strict';

const fs = require('fs');
const path = require('path');
const { seedLocal } = require('./seed');
const { STATE_PATH, baseUrl } = require('./session');

const tokenForRun = async () => {
    if (!process.env.VISUAL_BASE_URL) return seedLocal();

    if (!process.env.VISUAL_TOKEN) {
        throw new Error(
            'VISUAL_TOKEN is not set. Live mode (VISUAL_BASE_URL) creates nothing, so it needs a ' +
                'token to sign in with:\n  VISUAL_BASE_URL=https://... VISUAL_TOKEN=<jwt> npm run test:visual'
        );
    }

    return process.env.VISUAL_TOKEN;
};

module.exports = async () => {
    const token = await tokenForRun();
    const state = {
        cookies: [],
        origins: [{ origin: new URL(baseUrl()).origin, localStorage: [{ name: 'token', value: token }] }],
    };

    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
};
