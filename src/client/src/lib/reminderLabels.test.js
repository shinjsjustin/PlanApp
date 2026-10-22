import { formatDue, formatAlert, formatRepeat } from './reminderLabels';

it.each([
    ['2026-11-03', '09:30', 'Tue 3 Nov, 09:30'],
    ['2026-11-03', null, 'Tue 3 Nov'],
    ['2026-01-01', '00:05', 'Thu 1 Jan, 00:05'],
    [null, null, ''],
])('formats due %s %s as "%s"', (date, time, expected) => {
    expect(formatDue(date, time)).toBe(expected);
});

it.each([
    ['2026-11-03T16:00:00.000Z', 'America/Los_Angeles', 'Tue 3 Nov, 08:00'],
    ['2026-11-03T16:00:00.000Z', 'Asia/Tokyo', 'Wed 4 Nov, 01:00'],
    [null, 'Asia/Tokyo', ''],
])('formats alert %s in %s as "%s"', (iso, zone, expected) => {
    expect(formatAlert(iso, zone)).toBe(expected);
});

it.each([
    [{ rule: 'none', every: null, weekdays: [] }, ''],
    [null, ''],
    [{ rule: 'daily', every: null, weekdays: [] }, 'Daily'],
    [{ rule: 'every_n_days', every: 2, weekdays: [] }, 'Every 2 days'],
    [{ rule: 'every_n_days', every: 1, weekdays: [] }, 'Every 1 day'],
    [{ rule: 'weekly', every: null, weekdays: ['mon', 'thu'] }, 'Weekly: Mon, Thu'],
    [{ rule: 'monthly', every: null, weekdays: [] }, 'Monthly'],
])('formats repeat %j as "%s"', (repeat, expected) => {
    expect(formatRepeat(repeat)).toBe(expected);
});
