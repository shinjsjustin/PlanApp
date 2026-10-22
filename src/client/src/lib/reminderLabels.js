const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

export function formatDue(dueDate, dueTime) {
    if (!dueDate) return '';
    const [year, month, day] = dueDate.split('-').map(Number);
    const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    const date = `${weekday} ${day} ${MONTH_NAMES[month - 1]}`;
    return dueTime ? `${date}, ${dueTime}` : date;
}

// timeZone undefined means the browser zone.
export function formatAlert(iso, timeZone) {
    if (!iso) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const part = (type) => parts.find((p) => p.type === type).value;
    return `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`;
}

export function formatRepeat(repeat) {
    if (!repeat) return '';
    switch (repeat.rule) {
        case 'daily':
            return 'Daily';
        case 'every_n_days':
            return `Every ${repeat.every} ${repeat.every === 1 ? 'day' : 'days'}`;
        case 'weekly':
            return `Weekly: ${repeat.weekdays.map(capitalize).join(', ')}`;
        case 'monthly':
            return 'Monthly';
        default:
            return '';
    }
}
