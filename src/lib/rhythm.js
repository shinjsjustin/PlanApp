'use strict';

const { z } = require('zod');

/**
 * Rhythm: validation of incoming anchors, gates, zone and sync cursor, plus the
 * wire shape of stored rows. Weekdays are a bitmask with Mon=1 .. Sun=64.
 */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ALL_DAYS_MASK = (1 << DAYS.length) - 1;
const GATE_KINDS = ['game_plan', 'plan', 'problem_phase', 'content'];
const GATE_STATES = ['open', 'held', 'green', 'assumed', 'rejected'];
const MAX_EXTERNAL_ID = 64;
const MAX_ANCHOR_TITLE = 100;
const MAX_DESCRIPTION = 200;
const MAX_GATE_TITLE = 150;
const MAX_HUB_URL = 500;
const MINUTES_PER_HOUR = 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const externalIdSchema = z
    .string({ error: 'id must be a string' })
    .min(1, 'id is required')
    .max(MAX_EXTERNAL_ID, `id must be at most ${MAX_EXTERNAL_ID} characters`)
    .regex(/^[A-Za-z0-9.:-]+$/, 'id may only contain letters, digits and . : -');

const timeSchema = z
    .string({ error: 'time must be HH:MM' })
    .regex(TIME_PATTERN, 'time must be HH:MM');

const daysSchema = z.union(
    [
        z.literal('daily'),
        z
            .array(z.enum(DAYS))
            .min(1, 'days must not be empty')
            .refine((list) => new Set(list).size === list.length, 'days must be unique'),
    ],
    { error: "days must be 'daily' or a list of mon..sun" }
);

const enabledSchema = z.boolean({ error: 'enabled must be true or false' });

const anchorPutSchema = z.strictObject({
    title: z
        .string({ error: 'title is required' })
        .trim()
        .min(1, 'title is required')
        .max(MAX_ANCHOR_TITLE, `title must be at most ${MAX_ANCHOR_TITLE} characters`),
    description: z
        .string({ error: 'description must be a string' })
        .max(MAX_DESCRIPTION, `description must be at most ${MAX_DESCRIPTION} characters`)
        .nullable(),
    time: timeSchema,
    days: daysSchema,
    enabled: enabledSchema.default(true),
});

const anchorPatchSchema = z
    .strictObject({
        time: timeSchema.optional(),
        days: daysSchema.optional(),
        enabled: enabledSchema.optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, 'at least one of time, days, enabled is required');

const instantSchema = (field) =>
    z.iso.datetime({ offset: true, error: `${field} must be an ISO instant with Z or an offset` });

const hubUrlSchema = z
    .string({ error: 'hubUrl must be a string' })
    .max(MAX_HUB_URL, `hubUrl must be at most ${MAX_HUB_URL} characters`)
    .refine((value) => /^https?:\/\//i.test(value) && URL.canParse(value), 'hubUrl must be an http(s) link')
    .nullable();

const gatePutSchema = z
    .strictObject({
        title: z
            .string({ error: 'title is required' })
            .trim()
            .min(1, 'title is required')
            .max(MAX_GATE_TITLE, `title must be at most ${MAX_GATE_TITLE} characters`),
        kind: z.enum(GATE_KINDS, { error: `kind must be one of ${GATE_KINDS.join(', ')}` }),
        opensAt: instantSchema('opensAt'),
        closesAt: instantSchema('closesAt'),
        state: z.enum(GATE_STATES, { error: `state must be one of ${GATE_STATES.join(', ')}` }),
        hubUrl: hubUrlSchema,
    })
    .refine((gate) => Date.parse(gate.closesAt) > Date.parse(gate.opensAt), {
        message: 'closesAt must be after opensAt',
        path: ['closesAt'],
    });

const isTimeZone = (value) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
    } catch {
        return false;
    }
};

const zoneSchema = z.strictObject({
    timeZone: z.string({ error: 'timeZone must be a string' }).refine(isTimeZone, 'timeZone is not a valid time zone'),
});

const sinceSchema = z.strictObject({ since: instantSchema('since') });

const daysToMask = (days) =>
    days === 'daily' ? ALL_DAYS_MASK : days.reduce((mask, day) => mask | (1 << DAYS.indexOf(day)), 0);

const maskToDays = (mask) =>
    mask === ALL_DAYS_MASK ? 'daily' : DAYS.filter((_day, index) => mask & (1 << index));

const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * MINUTES_PER_HOUR + minutes;
};

const pad2 = (n) => String(n).padStart(2, '0');

const minutesToTime = (total) => `${pad2(Math.floor(total / MINUTES_PER_HOUR))}:${pad2(total % MINUTES_PER_HOUR)}`;

// 'YYYY-MM-DD HH:MM:SS.mmm' in UTC, the form DATETIME(3) columns take.
const toUtcDatetime = (iso) => new Date(iso).toISOString().replace('T', ' ').replace('Z', '');

const toAnchor = (row) => ({
    id: row.external_id,
    title: row.title,
    description: row.description ?? null,
    time: minutesToTime(row.at_minutes),
    days: maskToDays(row.weekdays),
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
});

const toGate = (row) => ({
    id: row.external_id,
    title: row.title,
    kind: row.kind,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    state: row.state,
    hubUrl: row.hub_url ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
});

module.exports = {
    DAYS,
    GATE_KINDS,
    GATE_STATES,
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
};
