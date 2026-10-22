'use strict';

// Playwright's runner cannot be loaded inside jest; the config only needs
// defineConfig to return its input and devices to be spreadable.
jest.mock('@playwright/test', () => ({
    defineConfig: (config) => config,
    devices: { 'Desktop Chrome': {} },
}));

const CONFIG_PATH = '../../playwright.visual.config.js';
const ENV_KEYS = ['VISUAL_REUSE_SERVER', 'VISUAL_BASE_URL', 'VISUAL_PHONE_BROWSER'];

const loadConfig = (env) => {
    const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    ENV_KEYS.forEach((k) => delete process.env[k]);
    Object.assign(process.env, env);
    try {
        let config;
        jest.isolateModules(() => {
            config = require(CONFIG_PATH);
        });
        return config;
    } finally {
        ENV_KEYS.forEach((k) => {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        });
    }
};

describe('playwright.visual.config webServer', () => {
    it.each([
        ['unset', {}],
        ['0', { VISUAL_REUSE_SERVER: '0' }],
        ['true', { VISUAL_REUSE_SERVER: 'true' }],
    ])('does not reuse a running server when VISUAL_REUSE_SERVER is %s', (_, env) => {
        expect(loadConfig(env).webServer.reuseExistingServer).toBe(false);
    });

    it('reuses a running server when VISUAL_REUSE_SERVER is 1', () => {
        expect(loadConfig({ VISUAL_REUSE_SERVER: '1' }).webServer.reuseExistingServer).toBe(true);
    });

    it('has no webServer when VISUAL_BASE_URL is set', () => {
        const config = loadConfig({ VISUAL_BASE_URL: 'https://example.test' });
        expect(config.webServer).toBeUndefined();
    });
});
