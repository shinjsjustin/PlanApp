'use strict';

const { TODO_NOTE_MAX_LENGTH, todoNoteSchema } = require('../../src/lib/validation');
const { toTodo } = require('../../src/lib/serializers');

describe('todoNoteSchema', () => {
    test.each([
        ['  hello\nworld  ', 'hello\nworld'],
        ['', null],
        ['   \n ', null],
        [null, null],
    ])('parses %j to %j', (input, expected) => {
        expect(todoNoteSchema.parse(input)).toBe(expected);
    });

    test('accepts a note of exactly the maximum length', () => {
        expect(todoNoteSchema.parse('a'.repeat(5000))).toHaveLength(5000);
    });

    test('rejects a note over 5000 characters', () => {
        expect(TODO_NOTE_MAX_LENGTH).toBe(5000);
        expect(() => todoNoteSchema.parse('a'.repeat(5001))).toThrow();
    });

    test('rejects a non-string note', () => {
        expect(() => todoNoteSchema.parse(5)).toThrow();
    });
});

describe('toTodo note', () => {
    test('passes the note through', () => {
        expect(toTodo({ note: 'line one\nline two' }).note).toBe('line one\nline two');
    });

    test('emits null when the row has no note', () => {
        expect(toTodo({}).note).toBeNull();
        expect(toTodo({ note: null }).note).toBeNull();
    });
});
