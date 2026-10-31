import { lastDoneLabel } from './choreGroups';

const TODAY = '2026-11-03';

describe('lastDoneLabel', () => {
    test('says Never done without a done-mark', () => {
        expect(lastDoneLabel({ lastDone: null }, TODAY)).toBe('Never done');
    });

    test('says day, month and who, without the year when it is this year', () => {
        expect(lastDoneLabel({ lastDone: { on: '2026-10-11', by: 'Justin' } }, TODAY)).toBe('Done 11 Oct \u00B7 Justin');
    });

    test('adds the year when it differs from today', () => {
        expect(lastDoneLabel({ lastDone: { on: '2025-10-11', by: 'Justin' } }, TODAY)).toBe('Done 11 Oct 2025 \u00B7 Justin');
    });
});
