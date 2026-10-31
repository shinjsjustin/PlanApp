'use strict';

const { addDays } = require('./localDate');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STATUS_RANK = { overdue: 0, due: 1, upcoming: 2, never: 3 };

const dayNumber = (dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / MS_PER_DAY;
};

const dueStatus = ({ windowMin, windowMax, lastDoneOn }, today) => {
    if (lastDoneOn === null) {
        return { status: 'never', daysSince: null, urgency: null, dueFrom: null, dueBy: null };
    }
    const daysSince = dayNumber(today) - dayNumber(lastDoneOn);
    let status = 'upcoming';
    if (daysSince > windowMax) status = 'overdue';
    else if (daysSince >= windowMin) status = 'due';
    return {
        status,
        daysSince,
        urgency: Math.round((daysSince / windowMax) * 100) / 100,
        dueFrom: addDays(lastDoneOn, windowMin),
        dueBy: addDays(lastDoneOn, windowMax),
    };
};

const compareChores = (a, b) => {
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (a.status === 'never') {
        return (
            a.window.max - b.window.max ||
            a.window.min - b.window.min ||
            a.name.localeCompare(b.name)
        );
    }
    return b.urgency - a.urgency || a.name.localeCompare(b.name);
};

const sortByUrgency = (chores) => [...chores].sort(compareChores);

module.exports = { dueStatus, sortByUrgency };
