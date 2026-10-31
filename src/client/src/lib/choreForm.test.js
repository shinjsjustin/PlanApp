import { parseWindow, formatWindow, emptyDraft, fromChore, validate, toPayload } from './choreForm';

describe('parseWindow', () => {
    test.each([
        ['7', { min: 7, max: 7 }],
        [' 7 - 10 ', { min: 7, max: 10 }],
        ['1-365', { min: 1, max: 365 }],
        ['7-7', { min: 7, max: 7 }],
    ])('parses %j', (text, expected) => {
        expect(parseWindow(text)).toEqual(expected);
    });

    test.each(['', '   ', '0', '366', '10-7', 'abc', '7-', '-7', '1.5', '7-x', '0-5', '5-366', '7 10'])(
        'gives null for %j',
        (text) => {
            expect(parseWindow(text)).toBeNull();
        },
    );
});

describe('formatWindow', () => {
    test.each([
        [{ min: 7, max: 7 }, '7 days'],
        [{ min: 7, max: 10 }, '7-10 days'],
        [{ min: 1, max: 1 }, '1 day'],
    ])('formats %j', (window, expected) => {
        expect(formatWindow(window)).toBe(expected);
    });
});

describe('drafts', () => {
    test('emptyDraft is blank', () => {
        expect(emptyDraft()).toEqual({ name: '', area: '', window: '', notes: '' });
    });

    test('fromChore shows the window without days and nulls as blank', () => {
        const chore = { name: 'Bins', area: null, window: { min: 7, max: 10 }, notes: null };
        expect(fromChore(chore)).toEqual({ name: 'Bins', area: '', window: '7-10', notes: '' });
        expect(fromChore({ ...chore, area: 'Yard', window: { min: 3, max: 3 }, notes: 'x' })).toEqual({
            name: 'Bins', area: 'Yard', window: '3', notes: 'x',
        });
    });
});

describe('validate', () => {
    const good = { name: 'Bins', area: '', window: '7', notes: '' };

    test('is empty for a valid draft', () => {
        expect(validate(good)).toEqual({});
    });

    test('flags a blank name', () => {
        expect(Object.keys(validate({ ...good, name: '  ' }))).toEqual(['name']);
    });

    test('flags a bad window', () => {
        expect(Object.keys(validate({ ...good, window: '10-7' }))).toEqual(['window']);
        expect(Object.keys(validate({ ...good, window: '' }))).toEqual(['window']);
    });

    test('flags both together', () => {
        expect(Object.keys(validate({ ...good, name: '', window: 'x' })).sort()).toEqual(['name', 'window']);
    });
});

describe('toPayload', () => {
    test('trims, parses the window and nulls blank area and notes', () => {
        expect(toPayload({ name: ' Bins ', area: '  ', window: '7-10', notes: '' })).toEqual({
            name: 'Bins', area: null, window: { min: 7, max: 10 }, notes: null,
        });
    });

    test('keeps filled area and notes trimmed', () => {
        expect(toPayload({ name: 'Bins', area: ' Yard ', window: '3', notes: ' hi ' })).toEqual({
            name: 'Bins', area: 'Yard', window: { min: 3, max: 3 }, notes: 'hi',
        });
    });
});
