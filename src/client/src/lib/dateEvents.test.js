import { blocksForDate } from './dateEvents';

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

test('clips a timed event inside the day to minutes', () => {
    const events = [
        { id: 'a', summary: 'Standup', start: local(2026, 3, 5, 9, 30), end: local(2026, 3, 5, 10, 15), allDay: false },
    ];
    expect(blocksForDate(events, '2026-03-05')).toEqual([
        { id: 'a', title: 'Standup', allDay: false, startMinutes: 570, durationMinutes: 45 },
    ]);
});

test('clips an event crossing midnight to each side', () => {
    const events = [
        { id: 'n', summary: 'Night', start: local(2026, 3, 5, 22), end: local(2026, 3, 6, 2), allDay: false },
    ];
    expect(blocksForDate(events, '2026-03-05')[0]).toMatchObject({ startMinutes: 1320, durationMinutes: 120 });
    expect(blocksForDate(events, '2026-03-06')[0]).toMatchObject({ startMinutes: 0, durationMinutes: 120 });
});

test('drops timed events that do not overlap the day, including one ending at midnight', () => {
    const events = [
        { id: 'x', summary: 'Before', start: local(2026, 3, 4, 22), end: local(2026, 3, 5, 0), allDay: false },
        { id: 'y', summary: 'After', start: local(2026, 3, 6, 0), end: local(2026, 3, 6, 1), allDay: false },
    ];
    expect(blocksForDate(events, '2026-03-05')).toEqual([]);
});

test('all-day events get allDay true, 0 and 1440, and a null summary becomes a fallback title', () => {
    const events = [{ id: 'h', summary: null, start: '2026-03-05', end: '2026-03-06', allDay: true }];
    expect(blocksForDate(events, '2026-03-05')).toEqual([
        { id: 'h', title: '(No title)', allDay: true, startMinutes: 0, durationMinutes: 1440 },
    ]);
});

test('drops all-day events outside the date', () => {
    const events = [{ id: 'h', summary: 'Trip', start: '2026-03-05', end: '2026-03-06', allDay: true }];
    expect(blocksForDate(events, '2026-03-06')).toEqual([]);
    expect(blocksForDate(events, '2026-03-04')).toEqual([]);
});
