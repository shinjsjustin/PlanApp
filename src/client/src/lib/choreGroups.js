const formatDay = (key, withYear) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'UTC',
});

export const lastDoneLabel = (chore, today) => {
    if (!chore.lastDone) return 'Never done';

    const { on, by } = chore.lastDone;
    const isOtherYear = on.slice(0, 4) !== today.slice(0, 4);

    return `Done ${formatDay(on, isOtherYear)} \u00B7 ${by}`;
};
