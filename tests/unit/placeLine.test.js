'use strict';

const {
    formatPlaceLine,
    placeForwardConfig,
    DEFAULT_TIME_ZONE,
} = require('../../src/lib/forward/placeLine');

const base = { ownerName: 'Justin Shin', placeName: 'Leemac', event: 'arrive' };

describe('formatPlaceLine', () => {
    test.each([
        ['arrive', 'UTC', '2026-03-10T10:42:00Z', 'Justin arrived at Leemac 10:42'],
        ['leave', 'UTC', '2026-03-10T10:42:00Z', 'Justin left Leemac 10:42'],
        ['arrive', 'America/Los_Angeles', '2026-03-10T07:05:00Z', 'Justin arrived at Leemac 00:05'],
        ['leave', 'America/Los_Angeles', '2026-03-11T06:59:00Z', 'Justin left Leemac 23:59'],
    ])('%s in %s at %s', (event, timeZone, iso, expected) => {
        expect(formatPlaceLine({ ...base, event, at: new Date(iso), timeZone })).toBe(expected);
    });

    test.each([
        ['Madonna', 'Madonna arrived at Leemac 10:42'],
        ['  Ann Lee Smith', 'Ann arrived at Leemac 10:42'],
        ['', 'Justin arrived at Leemac 10:42'],
        ['   ', 'Justin arrived at Leemac 10:42'],
        [null, 'Justin arrived at Leemac 10:42'],
    ])('name from %p', (ownerName, expected) => {
        const at = new Date('2026-03-10T10:42:00Z');
        expect(formatPlaceLine({ ...base, ownerName, at, timeZone: 'UTC' })).toBe(expected);
    });
});

describe('placeForwardConfig', () => {
    const set = { BOURNE_PLACE_URL: 'http://x/p', BOURNE_PLACE_TOKEN: 't' };

    test('returns url, token and default zone when both are set', () => {
        expect(placeForwardConfig(set)).toEqual({
            url: 'http://x/p',
            token: 't',
            timeZone: 'America/Los_Angeles',
        });
        expect(DEFAULT_TIME_ZONE).toBe('America/Los_Angeles');
    });

    test('returns null when url or token is missing or empty', () => {
        expect(placeForwardConfig({})).toBeNull();
        expect(placeForwardConfig({ BOURNE_PLACE_URL: 'u' })).toBeNull();
        expect(placeForwardConfig({ BOURNE_PLACE_TOKEN: 't' })).toBeNull();
        expect(placeForwardConfig({ ...set, BOURNE_PLACE_TOKEN: '' })).toBeNull();
    });

    test('uses BOURNE_PLACE_TIME_ZONE when valid', () => {
        expect(placeForwardConfig({ ...set, BOURNE_PLACE_TIME_ZONE: 'UTC' }).timeZone).toBe('UTC');
    });

    test('falls back to default when zone is invalid or empty', () => {
        expect(placeForwardConfig({ ...set, BOURNE_PLACE_TIME_ZONE: 'Not/AZone' }).timeZone).toBe(
            'America/Los_Angeles'
        );
        expect(placeForwardConfig({ ...set, BOURNE_PLACE_TIME_ZONE: '' }).timeZone).toBe(
            'America/Los_Angeles'
        );
    });
});
