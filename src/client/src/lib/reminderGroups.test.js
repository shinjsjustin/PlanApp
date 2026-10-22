import { groupByDue } from './reminderGroups';

const r = (id, dueDate, overdue = false) => ({ id, dueDate, overdue });
const TODAY = '2026-05-10';

describe('groupByDue', () => {
    test('orders groups Overdue, Today, Upcoming, No date and keeps input order inside each', () => {
        const input = [
            r(1, null), r(2, '2026-05-12'), r(3, '2026-05-10'), r(4, '2026-05-01'),
            r(5, '2026-05-11'), r(6, '2026-05-10'), r(7, '2026-04-30'),
        ];
        const groups = groupByDue(input, TODAY);
        expect(groups.map((g) => g.label)).toEqual(['Overdue', 'Today', 'Upcoming', 'No date']);
        expect(groups.map((g) => g.reminders.map((x) => x.id))).toEqual([[4, 7], [3, 6], [2, 5], [1]]);
    });

    test('treats the overdue flag as overdue even when dueDate is today or later', () => {
        const groups = groupByDue([r(1, '2026-05-10', true), r(2, '2026-06-01', true)], TODAY);
        expect(groups).toEqual([{ label: 'Overdue', reminders: [r(1, '2026-05-10', true), r(2, '2026-06-01', true)] }]);
    });

    test('drops empty groups and returns an empty list for no reminders', () => {
        expect(groupByDue([r(1, '2026-05-11')], TODAY).map((g) => g.label)).toEqual(['Upcoming']);
        expect(groupByDue([], TODAY)).toEqual([]);
    });
});
