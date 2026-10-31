import { lastDoneLabel } from './choreGroups';

describe('lastDoneLabel', () => {
    test('says Never done without a done-mark', () => {
        expect(lastDoneLabel({ lastDone: null })).toBe('Never done');
    });

    test('says when and by whom', () => {
        expect(lastDoneLabel({ lastDone: { on: '2026-10-20', by: 'Jacklin' } })).toBe('Last done 2026-10-20 by Jacklin');
    });
});
