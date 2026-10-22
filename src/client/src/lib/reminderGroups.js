const GROUP_LABELS = ['Overdue', 'Today', 'Upcoming', 'No date'];

const groupLabel = (reminder, today) => {
    if (reminder.overdue || (reminder.dueDate && reminder.dueDate < today)) return 'Overdue';
    if (!reminder.dueDate) return 'No date';
    return reminder.dueDate === today ? 'Today' : 'Upcoming';
};

/** Splits reminders into dated groups, dropping empty ones and keeping input order. */
export const groupByDue = (reminders, today) => GROUP_LABELS
    .map((label) => ({ label, reminders: reminders.filter((reminder) => groupLabel(reminder, today) === label) }))
    .filter((group) => group.reminders.length > 0);
