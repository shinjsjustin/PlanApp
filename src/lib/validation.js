'use strict';

const { z } = require('zod');

/**
 * The field schemas every resource route shares (spec section 4.4).
 *
 * Projects, layers and sequences all carry a title in the same `varchar(255)`
 * column and answer the same way to a blank one, so the rule lives here once
 * rather than being restated — and drifting — in each router.
 */

const TITLE_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 2000;
const TODO_TEXT_MAX_LENGTH = 500;

/** Mirrors the `todos.status` enum in the schema. */
const TODO_STATUSES = ['incomplete', 'complete', 'blocked'];

const titleSchema = z
    .string({ error: 'title is required' })
    .trim()
    .min(1, 'title is required')
    .max(TITLE_MAX_LENGTH, `title must be at most ${TITLE_MAX_LENGTH} characters`);

// An absent description leaves the field alone; an empty or explicitly null one
// clears it, so the client never has to send two different shapes to do that.
const descriptionSchema = z
    .string()
    .trim()
    .max(DESCRIPTION_MAX_LENGTH, `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value));

// A to-do's text is trimmed at the boundary, so " read about lift " and
// "read about lift" are the same to-do and a whitespace-only one is refused
// rather than stored as a blank line.
const todoTextSchema = z
    .string({ error: 'text is required' })
    .trim()
    .min(1, 'text is required')
    .max(TODO_TEXT_MAX_LENGTH, `text must be at most ${TODO_TEXT_MAX_LENGTH} characters`);

const todoStatusSchema = z.enum(TODO_STATUSES, {
    error: `status must be one of: ${TODO_STATUSES.join(', ')}`,
});

const idSchema = z.coerce
    .number({ error: 'id must be a positive integer' })
    .int('id must be a positive integer')
    .positive('id must be a positive integer');

/**
 * Route params arrive as strings, so ids are coerced. A malformed one throws a
 * `ZodError` and comes back as a 400 rather than reaching a query as `NaN`.
 */
const parseId = (value) => idSchema.parse(value);

/**
 * Rejects a PATCH body that names nothing to change. An empty patch is a caller
 * mistake, and answering 200 to it would hide that.
 */
const requireSomeField = (schema, fields) =>
    schema.refine((patch) => fields.some((field) => patch[field] !== undefined), {
        message: `supply at least one of: ${fields.join(', ')}`,
    });

module.exports = {
    DESCRIPTION_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    TODO_STATUSES,
    TODO_TEXT_MAX_LENGTH,
    descriptionSchema,
    idSchema,
    parseId,
    requireSomeField,
    titleSchema,
    todoStatusSchema,
    todoTextSchema,
};
