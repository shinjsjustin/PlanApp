'use strict';

const { isDateKey } = require('./localDate');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TITLE_DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/i;

const pad = (n) => String(n).padStart(2, '0');

// Daily sequences are titled by date ("Mon Oct 19"); the title carries no year,
// so it is taken from today, nudged across the December/January boundary.
const dateKeyOfTitle = (title, today) => {
    const match = typeof title === 'string' ? TITLE_DATE.exec(title) : null;
    if (!match) return null;
    const month = MONTHS.indexOf(match[1].toLowerCase()) + 1;
    const [todayYear, todayMonth] = today.split('-').map(Number);
    let year = todayYear;
    if (month === 1 && todayMonth === 12) year += 1;
    if (month === 12 && todayMonth === 1) year -= 1;
    const key = `${year}-${pad(month)}-${pad(Number(match[2]))}`;
    return isDateKey(key) ? key : null;
};

const titleDateOf = (dateKey) => {
    const [, month, day] = dateKey.split('-').map(Number);
    return `${MONTHS[month - 1][0].toUpperCase()}${MONTHS[month - 1].slice(1)} ${day}`;
};

module.exports = { dateKeyOfTitle, titleDateOf };
