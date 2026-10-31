import { groupChores, lastDoneLabel } from './choreGroups';

const chore = (name, status) => ({ name, status });

describe('groupChores', () => {
    test('buckets by status in fixed order, keeping input order, omitting empty groups', () => {
        const input = [
            chore('a', 'never'), chore('b', 'upcoming'), chore('c', 'overdue'),
            chore('d', 'due'), chore('e', 'overdue'), chore('f', 'never'),
        ];
        const copy = [...input];
        const groups = groupChores(input);
        expect(groups.map((g) => [g.status, g.label, g.chores.map((c) => c.name)])).toEqual([
            ['overdue', 'Overdue', ['c', 'e']],
            ['due', 'Due now', ['d']],
            ['upcoming', 'Coming up', ['b']],
            ['never', 'Never done', ['a', 'f']],
        ]);
        expect(input).toEqual(copy);
    });

    test('omits empty groups and handles no chores', () => {
        expect(groupChores([chore('a', 'due')]).map((g) => g.status)).toEqual(['due']);
        expect(groupChores([])).toEqual([]);
    });
});

describe('lastDoneLabel', () => {
    test('says Never done without a done-mark', () => {
        expect(lastDoneLabel({ lastDone: null })).toBe('Never done');
    });

    test('says when and by whom', () => {
        expect(lastDoneLabel({ lastDone: { on: '2026-10-20', by: 'Jacklin' } })).toBe('Last done 2026-10-20 by Jacklin');
    });
});
