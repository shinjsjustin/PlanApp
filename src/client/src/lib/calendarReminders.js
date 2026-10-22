const MINUTES_PER_HOUR = 60;

// dueTime is wall-clock 'HH:MM' in the reminder's zone; shown as written.
export const parseDueTime = (dueTime) => {
    const [hours, minutes] = dueTime.split(':').map(Number);

    return hours * MINUTES_PER_HOUR + minutes;
};

// Date-only reminders have no place on the time grid, so they are dropped.
export const groupRemindersByDate = (reminders) => {
    const byDate = new Map();

    reminders
        .filter((reminder) => reminder.dueDate && reminder.dueTime)
        .map(({ id, title, dueDate, dueTime, priority }) => ({
            dueDate,
            block: { id, title, startMinutes: parseDueTime(dueTime), priority },
        }))
        .forEach(({ dueDate, block }) =>
            byDate.set(dueDate, [...(byDate.get(dueDate) ?? []), block])
        );

    byDate.forEach((blocks, dueDate) =>
        byDate.set(dueDate, [...blocks].sort((a, b) => a.startMinutes - b.startMinutes))
    );

    return byDate;
};
