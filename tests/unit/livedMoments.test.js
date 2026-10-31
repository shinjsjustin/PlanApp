'use strict';

const { ZodError } = require('zod');
const {
    CATEGORIES,
    DAY_START,
    DAY_END,
    daySchema,
    dateParamSchema,
    rangeSchema,
    toLivedMoment,
} = require('../../src/lib/livedMoments');

const moment = (overrides = {}) => ({
    startMinutes: 300,
    durationMinutes: 60,
    title: 'Morning prayer',
    category: 'god',
    ...overrides,
});

describe('constants', () => {
    test('CATEGORIES lists the seven categories', () => {
        expect(CATEGORIES).toEqual(['god', 'family', 'work', 'building', 'rest', 'sleep', 'drive']);
    });
    test('day runs 04:00 to 04:00 next day', () => {
        expect([DAY_START, DAY_END]).toEqual([240, 1680]);
    });
});

describe('daySchema', () => {
    test('accepts a valid moment and applies defaults, trimming the title', () => {
        const parsed = daySchema.parse({ moments: [moment({ title: '  Pray  ' })] });
        expect(parsed.moments[0]).toEqual({
            startMinutes: 300,
            durationMinutes: 60,
            title: 'Pray',
            category: 'god',
            detail: null,
            chatTicks: [],
        });
    });

    test('accepts an empty list', () => {
        expect(daySchema.parse({ moments: [] })).toEqual({ moments: [] });
    });

    test('accepts overlapping moments and boundary values', () => {
        const moments = [
            moment({ startMinutes: 240, durationMinutes: 1440, chatTicks: [240, 1680] }),
            moment({ startMinutes: 1679, durationMinutes: 1, detail: 'x'.repeat(5000) }),
        ];
        expect(daySchema.parse({ moments }).moments).toHaveLength(2);
    });

    test.each([
        ['missing title', { title: undefined }],
        ['blank title', { title: '   ' }],
        ['title over 100', { title: 'x'.repeat(101) }],
        ['unknown category', { category: 'play' }],
        ['ends past 1680', { startMinutes: 1600, durationMinutes: 81 }],
        ['start below 240', { startMinutes: 239 }],
        ['start at 1680', { startMinutes: 1680, durationMinutes: 1 }],
        ['non-integer start', { startMinutes: 300.5 }],
        ['non-integer duration', { durationMinutes: 10.5 }],
        ['zero duration', { durationMinutes: 0 }],
        ['tick before start', { chatTicks: [299] }],
        ['tick after end', { chatTicks: [361] }],
        ['non-integer tick', { chatTicks: [300.5] }],
        ['too many ticks', { startMinutes: 240, durationMinutes: 1440, chatTicks: Array(501).fill(300) }],
        ['detail over 5000', { detail: 'x'.repeat(5001) }],
        ['unknown key on moment', { color: 'red' }],
    ])('rejects %s', (_name, overrides) => {
        expect(() => daySchema.parse({ moments: [moment(overrides)] })).toThrow(ZodError);
    });

    test.each([
        ['non-array moments', { moments: 'nope' }],
        ['missing moments', {}],
        ['unknown top-level key', { moments: [], extra: 1 }],
        ['more than 300 moments', { moments: Array(301).fill(moment()) }],
    ])('rejects %s', (_name, body) => {
        expect(() => daySchema.parse(body)).toThrow(ZodError);
    });

    test('accepts exactly 300 moments', () => {
        expect(daySchema.parse({ moments: Array(300).fill(moment()) }).moments).toHaveLength(300);
    });
});

describe('dateParamSchema', () => {
    test('accepts a real date', () => {
        expect(dateParamSchema.parse('2026-10-15')).toBe('2026-10-15');
    });
    test.each(['2026-02-30', '2026-1-5', '', 5])('rejects %p', (value) => {
        expect(() => dateParamSchema.parse(value)).toThrow(ZodError);
    });
});

describe('rangeSchema', () => {
    test('accepts from equal to to', () => {
        expect(rangeSchema.parse({ from: '2026-10-15', to: '2026-10-15' })).toEqual({
            from: '2026-10-15',
            to: '2026-10-15',
        });
    });
    test('accepts 62 days inclusive', () => {
        expect(() => rangeSchema.parse({ from: '2026-01-01', to: '2026-03-03' })).not.toThrow();
    });
    test.each([
        ['bad from', { from: 'nope', to: '2026-10-31' }],
        ['bad to', { from: '2026-10-31', to: 'nope' }],
    ])('safeParse reports %s as a ZodError without throwing', (_name, query) => {
        const result = rangeSchema.safeParse(query);
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(ZodError);
    });
    test.each([
        ['63 days inclusive', { from: '2026-01-01', to: '2026-03-04' }],
        ['from after to', { from: '2026-10-16', to: '2026-10-15' }],
        ['bad from', { from: '2026-02-30', to: '2026-03-05' }],
        ['missing to', { from: '2026-10-15' }],
    ])('rejects %s', (_name, query) => {
        expect(() => rangeSchema.parse(query)).toThrow(ZodError);
    });
});

describe('toLivedMoment', () => {
    const row = {
        id: 7,
        owner_id: 1,
        lived_on: '2026-10-05',
        start_minutes: 300,
        duration_minutes: 45,
        title: 'Build',
        category: 'building',
        detail: null,
        chat_ticks: [310, 320],
    };
    const expected = {
        id: 7,
        date: '2026-10-05',
        startMinutes: 300,
        durationMinutes: 45,
        title: 'Build',
        category: 'building',
        detail: null,
        chatTicks: [310, 320],
    };

    test('maps a row with a string date and array ticks', () => {
        expect(toLivedMoment(row)).toEqual(expected);
    });
});
