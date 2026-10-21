'use strict';

const path = require('path');
const { dataOf } = require('../e2e/helpers');

const LOCAL_URL = 'http://localhost:3102';
const STATE_PATH = path.join(__dirname, '.auth', 'state.json');

const baseUrl = () => process.env.VISUAL_BASE_URL || LOCAL_URL;
const apiUrl = () => process.env.VISUAL_API_URL || `${baseUrl()}/api`;

/**
 * Against a live site the suite must only look. Aborting every non-GET API call
 * means a click on a delete button cannot change real data.
 */
const guardReadOnly = async (page) => {
    if (!process.env.VISUAL_BASE_URL) return;

    await page.route('**/api/**', (route) =>
        route.request().method() === 'GET' ? route.continue() : route.abort()
    );
};

/** Every project id the token's user owns. */
const listProjects = async (request, token) => {
    const projects = await dataOf(
        await request.get(`${apiUrl()}/projects`, { headers: { Authorization: `Bearer ${token}` } })
    );

    return projects.map((project) => project.id);
};

module.exports = { LOCAL_URL, STATE_PATH, apiUrl, baseUrl, guardReadOnly, listProjects };
