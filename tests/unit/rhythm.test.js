'use strict';

const { ZodError } = require('zod');

const {
    externalIdSchema,
    anchorPutSchema,
    anchorPatchSchema,
    gatePutSchema,
    zoneSchema,
    sinceSchema,
    daysToMask,
    maskToDays,
    timeToMinutes,
    minutesToTime,
    toUtcDatetime,
    toAnchor,
    toGate,
} = require('../../src/lib/rhythm');

const accepts = (schema, value) => schema.parse(value);
const rejects = (schema, value) => expect(() => schema.parse(value)).toThrow(ZodError);

describe('externalIdSchema', () => {
    test.each(['a', 'Anchor_1'.replace('_', '.'), 'a:b-c.d', 'x'.repeat(64)])('accepts %p', (v) => {
        expect(accepts(externalIdSchema, v)).toBe(v);
    });
    test.each(['', 'x'.repeat(65), 'has space', 'a/b', 'é', 'a_b', 5, null])('rejects %p', (v) => {
        rejects(externalIdSchema, v);
    });
});

describe('anchorPutSchema', () => {
    const good = { title: 'Pray', description: null, time: '06:30', days: 'daily' };

    test('accepts a good anchor, trims the title and defaults enabled to true', () => {
        expect(accepts(anchorPutSchema, { ...good, title: '  Pray  ' })).toEqual({
            title: 'Pray',
            description: null,
            time: '06:30',
            days: 'daily',
            enabled: true,
        });
    });

    test('accepts a day list and a description', () => {
        const out = accepts(anchorPutSchema, {
            ...good,
            description: 'x'.repeat(200),
            days: ['mon', 'sun'],
            enabled: false,
        });
        expect(out.days).toEqual(['mon', 'sun']);
        expect(out.enabled).toBe(false);
    });

    test.each([
        ['empty title', { title: '   ' }],
        ['long title', { title: 'x'.repeat(101) }],
        ['long description', { description: 'x'.repeat(201) }],
        ['24:00', { time: '24:00' }],
        ['minute 60', { time: '12:60' }],
        ['single digit hour', { time: '6:30' }],
        ['seconds', { time: '06:30:00' }],
        ['empty days', { days: [] }],
        ['duplicate days', { days: ['mon', 'mon'] }],
        ['bad day name', { days: ['monday'] }],
        ['bad days string', { days: 'weekdays' }],
        ['non-boolean enabled', { enabled: 'yes' }],
        ['updatedBy', { updatedBy: 'bourne' }],
        ['unknown key', { extra: 1 }],
    ])('rejects %s', (_name, patch) => {
        rejects(anchorPutSchema, { ...good, ...patch });
    });

    test('rejects a missing time', () => {
        rejects(anchorPutSchema, { title: 'Pray', days: 'daily' });
    });
});

describe('anchorPatchSchema', () => {
    test.each([{ time: '07:00' }, { days: ['tue'] }, { enabled: false }, { time: '07:00', enabled: true }])(
        'accepts %p',
        (v) => {
            expect(accepts(anchorPatchSchema, v)).toEqual(v);
        }
    );
    test.each([
        {},
        { time: '25:00' },
        { days: [] },
        { enabled: 1 },
        { title: 'x' },
        { updatedBy: 'justin' },
        { time: '07:00', updatedBy: 'justin' },
    ])('rejects %p', (v) => {
        rejects(anchorPatchSchema, v);
    });
});

describe('gatePutSchema', () => {
    const good = {
        title: 'Game plan',
        kind: 'game_plan',
        opensAt: '2026-11-17T08:00:00Z',
        closesAt: '2026-11-17T12:00:00+02:00',
        state: 'open',
        hubUrl: 'https://example.com/hub',
    };

    test('accepts a good gate', () => {
        expect(accepts(gatePutSchema, good)).toEqual(good);
        expect(accepts(gatePutSchema, { ...good, hubUrl: null }).hubUrl).toBeNull();
    });

    test.each([
        ['empty title', { title: '' }],
        ['long title', { title: 'x'.repeat(151) }],
        ['bad kind', { kind: 'other' }],
        ['bad state', { state: 'closed' }],
        ['opensAt without zone', { opensAt: '2026-11-17T08:00:00' }],
        ['opensAt date only', { opensAt: '2026-11-17' }],
        ['closesAt garbage', { closesAt: 'soon' }],
        ['closesAt equals opensAt', { closesAt: '2026-11-17T08:00:00Z' }],
        ['closesAt before opensAt', { closesAt: '2026-11-17T07:59:59Z' }],
        ['offset makes window reversed', { closesAt: '2026-11-17T09:00:00+02:00' }],
        ['javascript link', { hubUrl: 'javascript:alert(1)' }],
        ['ftp link', { hubUrl: 'ftp://example.com' }],
        ['long link', { hubUrl: 'https://example.com/' + 'x'.repeat(500) }],
        ['updatedBy', { updatedBy: 'bourne' }],
        ['unknown key', { extra: true }],
    ])('rejects %s', (_name, patch) => {
        rejects(gatePutSchema, { ...good, ...patch });
    });
});

describe('zoneSchema', () => {
    test('accepts a real zone', () => {
        expect(accepts(zoneSchema, { timeZone: 'America/New_York' })).toEqual({ timeZone: 'America/New_York' });
    });
    test.each([{ timeZone: 'Mars/Base' }, { timeZone: '' }, { timeZone: 5 }, {}, { timeZone: 'UTC', x: 1 }])(
        'rejects %p',
        (v) => rejects(zoneSchema, v)
    );
});

describe('sinceSchema', () => {
    test('accepts an ISO instant', () => {
        expect(accepts(sinceSchema, { since: '2026-11-17T08:00:00.000Z' })).toEqual({
            since: '2026-11-17T08:00:00.000Z',
        });
    });
    test.each([{ since: 'yesterday' }, { since: '2026-11-17' }, { since: '2026-11-17T08:00:00' }, {}, { since: '2026-11-17T08:00:00Z', x: 1 }])(
        'rejects %p',
        (v) => rejects(sinceSchema, v)
    );
});

describe('days masks', () => {
    test.each([
        ['daily', 127],
        [['mon', 'wed'], 5],
        [['sun'], 64],
        [['sat', 'mon'], 33],
    ])('daysToMask(%p) = %p', (days, mask) => {
        expect(daysToMask(days)).toBe(mask);
    });

    test.each([
        [127, 'daily'],
        [5, ['mon', 'wed']],
        [64, ['sun']],
        [33, ['mon', 'sat']],
    ])('maskToDays(%p) = %p', (mask, days) => {
        expect(maskToDays(mask)).toEqual(days);
    });

    test('a full day list is daily', () => {
        expect(daysToMask(['sun', 'sat', 'fri', 'thu', 'wed', 'tue', 'mon'])).toBe(127);
    });
});

describe('time converters', () => {
    test.each([
        ['00:00', 0],
        ['06:30', 390],
        ['23:59', 1439],
    ])('%s <-> %i', (time, mins) => {
        expect(timeToMinutes(time)).toBe(mins);
        expect(minutesToTime(mins)).toBe(time);
    });
});

describe('toUtcDatetime', () => {
    test.each([
        ['2026-11-17T08:00:00Z', '2026-11-17 08:00:00.000'],
        ['2026-11-17T08:00:00.123Z', '2026-11-17 08:00:00.123'],
        ['2026-11-17T23:30:00-05:00', '2026-11-18 04:30:00.000'],
        ['2026-11-17T01:00:00+02:00', '2026-11-16 23:00:00.000'],
    ])('%s -> %s', (iso, expected) => {
        expect(toUtcDatetime(iso)).toBe(expected);
    });
});

describe('wire shapes', () => {
    test('toAnchor maps a row', () => {
        const row = {
            id: 9,
            external_id: 'pray',
            title: 'Pray',
            description: null,
            at_minutes: 390,
            weekdays: 5,
            enabled: 1,
            updated_at: '2026-11-17T08:00:00.000Z',
            updated_by: 'bourne',
        };
        expect(toAnchor(row)).toEqual({
            id: 'pray',
            title: 'Pray',
            description: null,
            time: '06:30',
            days: ['mon', 'wed'],
            enabled: true,
            updatedAt: '2026-11-17T08:00:00.000Z',
            updatedBy: 'bourne',
        });
        expect(toAnchor({ ...row, weekdays: 127, enabled: 0, description: 'd' })).toMatchObject({
            days: 'daily',
            enabled: false,
            description: 'd',
        });
    });

    test('toGate maps a row', () => {
        const row = {
            id: 4,
            external_id: 'g1',
            title: 'Game plan',
            kind: 'plan',
            opens_at: '2026-11-17T08:00:00.000Z',
            closes_at: '2026-11-17T10:00:00.000Z',
            state: 'held',
            hub_url: null,
            updated_at: '2026-11-17T09:00:00.000Z',
            updated_by: 'justin',
        };
        expect(toGate(row)).toEqual({
            id: 'g1',
            title: 'Game plan',
            kind: 'plan',
            opensAt: '2026-11-17T08:00:00.000Z',
            closesAt: '2026-11-17T10:00:00.000Z',
            state: 'held',
            hubUrl: null,
            updatedAt: '2026-11-17T09:00:00.000Z',
            updatedBy: 'justin',
        });
    });
});
