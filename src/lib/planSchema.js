'use strict';

const { badRequest } = require('./httpError');
const {
    PLAN_SCHEMA_MAX_LENGTH,
    PLAN_SCHEMA_MAX_SEQUENCES,
    PLAN_SCHEMA_MAX_TODOS,
    TITLE_MAX_LENGTH,
    TODO_TEXT_MAX_LENGTH,
} = require('./validation');

/**
 * Parses the plan schema text: `## layer`, `### sequence`, `- todo`, blanks
 * skipped. Todos before the first `###` belong to Unorganized. Every failure is
 * a 400 naming the 1-based line, counting blank lines.
 */

const LAYER_PREFIX = '## ';
const SEQUENCE_PREFIX = '### ';
const TODO_PREFIX = '-';

const lineError = (number, message) => badRequest(`line ${number}: ${message}`);

const checkedValue = (raw, number, label, maxLength) => {
    const value = raw.trim();
    if (!value) throw lineError(number, `${label} is empty`);
    if (value.length > maxLength) {
        throw lineError(number, `${label} must be at most ${maxLength} characters`);
    }
    return value;
};

const parsePlanSchema = (text, { mode }) => {
    if (typeof text !== 'string' || !text.trim()) throw badRequest('schema is empty');
    if (text.length > PLAN_SCHEMA_MAX_LENGTH) {
        throw badRequest(`schema must be at most ${PLAN_SCHEMA_MAX_LENGTH} characters`);
    }

    let layerTitle = null;
    let isFirstContent = true;
    let todoCount = 0;
    const unorganized = [];
    const sequences = [];

    text.split('\n').forEach((rawLine, index) => {
        const number = index + 1;
        const line = rawLine.trim();
        if (!line) return;

        const isFirst = isFirstContent;
        isFirstContent = false;

        if (isFirst && mode === 'layer' && !line.startsWith(LAYER_PREFIX)) {
            throw lineError(number, 'expected "## <layer title>" first');
        }

        if (line.startsWith(LAYER_PREFIX)) {
            if (!isFirst) throw lineError(number, 'a "##" line is only allowed first');
            layerTitle = checkedValue(line.slice(LAYER_PREFIX.length), number, 'layer title', TITLE_MAX_LENGTH);
        } else if (line.startsWith(SEQUENCE_PREFIX)) {
            if (sequences.length >= PLAN_SCHEMA_MAX_SEQUENCES) {
                throw lineError(number, `at most ${PLAN_SCHEMA_MAX_SEQUENCES} sequences allowed`);
            }
            const title = checkedValue(line.slice(SEQUENCE_PREFIX.length), number, 'sequence title', TITLE_MAX_LENGTH);
            sequences.push({ title, todos: [] });
        } else if (line.startsWith(TODO_PREFIX)) {
            if (todoCount >= PLAN_SCHEMA_MAX_TODOS) {
                throw lineError(number, `at most ${PLAN_SCHEMA_MAX_TODOS} todos allowed`);
            }
            todoCount += 1;
            const todo = checkedValue(line.slice(TODO_PREFIX.length), number, 'todo text', TODO_TEXT_MAX_LENGTH);
            (sequences.length ? sequences[sequences.length - 1].todos : unorganized).push(todo);
        } else {
            throw lineError(number, 'expected "##", "###" or "-"');
        }
    });

    return { layerTitle, unorganized, sequences };
};

module.exports = { parsePlanSchema };
