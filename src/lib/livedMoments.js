'use strict';

const { z } = require('zod');

const { isDateKey, addDays } = require('./localDate');

/**
 * Lived moments: validation of incoming days and the wire shape of stored rows.
 * Minutes count from 00:00 of the moment's date, so the day runs past midnight.
 */

const CATEGORIES = ['god', 'family', 'work', 'building', 'rest', 'sleep', 'drive'];
const DAY_START = 240;
const DAY_END = 1680;
const MAX_TITLE = 100;
const MAX_DETAIL = 5000;
const MAX_TICKS = 500;
const MAX_MOMENTS = 300;
const MAX_RANGE_DAYS = 62;

const minutes = (field) =>
    z.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`);

const momentSchema = z
    .strictObject({
        startMinutes: minutes('startMinutes')
            .min(DAY_START, `startMinutes must be at least ${DAY_START}`)
            .max(DAY_END - 1, `startMinutes must be at most ${DAY_END - 1}`),
        durationMinutes: minutes('durationMinutes').min(1, 'durationMinutes must be at least 1'),
        title: z
            .string({ error: 'title is required' })
            .trim()
            .min(1, 'title is required')
            .max(MAX_TITLE, `title must be at most ${MAX_TITLE} characters`),
        category: z.enum(CATEGORIES, { error: `category must be one of ${CATEGORIES.join(', ')}` }),
        detail: z
            .string({ error: 'detail must be a string' })
            .max(MAX_DETAIL, `detail must be at most ${MAX_DETAIL} characters`)
            .nullable()
            .default(null),
        chatTicks: z
            .array(minutes('chatTicks entries'))
            .max(MAX_TICKS, `chatTicks must have at most ${MAX_TICKS} entries`)
            .default([]),
    })
    .refine((m) => m.startMinutes + m.durationMinutes <= DAY_END, {
        message: `moment must end by ${DAY_END}`,
        path: ['durationMinutes'],
    })
    .refine(
        (m) =>
            m.chatTicks.every(
                (tick) => tick >= m.startMinutes && tick <= m.startMinutes + m.durationMinutes
            ),
        { message: 'chatTicks must lie within the moment', path: ['chatTicks'] }
    );

const daySchema = z.strictObject({
    moments: z
        .array(momentSchema, { error: 'moments must be an array' })
        .max(MAX_MOMENTS, `moments must have at most ${MAX_MOMENTS} entries`),
});

const dateParamSchema = z
    .string({ error: 'date must be YYYY-MM-DD' })
    .refine(isDateKey, 'date must be YYYY-MM-DD');

const rangeSchema = z
    .object({ from: dateParamSchema, to: dateParamSchema })
    .refine(({ from, to }) => from <= to, { message: 'from must not be after to' })
    .refine(({ from, to }) => to <= addDays(from, MAX_RANGE_DAYS - 1), {
        message: `range must be at most ${MAX_RANGE_DAYS} days`,
    });

// mysql2 returns DATE as a local-midnight Date and JSON as text or parsed, by driver config.
const dateKeyOf = (value) => {
    if (typeof value === 'string') return value.slice(0, 10);
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

const toLivedMoment = (row) => ({
    id: row.id,
    date: dateKeyOf(row.lived_on),
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
    title: row.title,
    category: row.category,
    detail: row.detail ?? null,
    chatTicks: (typeof row.chat_ticks === 'string' ? JSON.parse(row.chat_ticks) : row.chat_ticks).map(Number),
});

module.exports = {
    CATEGORIES,
    DAY_START,
    DAY_END,
    momentSchema,
    daySchema,
    dateParamSchema,
    rangeSchema,
    toLivedMoment,
};
