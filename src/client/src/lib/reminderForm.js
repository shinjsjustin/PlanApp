// Pure helpers behind the reminder form. A draft holds form-friendly values
// (strings for inputs, ids as numbers or null); toPayload shapes it for the API.

export const WEEKDAYS = [
    { value: 'mon', label: 'Mon' },
    { value: 'tue', label: 'Tue' },
    { value: 'wed', label: 'Wed' },
    { value: 'thu', label: 'Thu' },
    { value: 'fri', label: 'Fri' },
    { value: 'sat', label: 'Sat' },
    { value: 'sun', label: 'Sun' },
];

export const emptyDraft = () => ({
    title: '',
    placeId: null,
    subcategoryId: null,
    personId: null,
    projectId: null,
    todoId: null,
    dueDate: '',
    dueTime: '',
    alertAt: '',
    trigger: 'none',
    priority: 'normal',
    repeatRule: 'none',
    every: '',
    weekdays: [],
});

const pad = (number) => String(number).padStart(2, '0');

// An ISO instant as the 'YYYY-MM-DDTHH:mm' a datetime-local input shows, in the browser zone.
const toLocalInput = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const idOf = (link) => (link ? link.id : null);

export const fromReminder = (reminder) => ({
    title: reminder.title,
    placeId: idOf(reminder.place),
    subcategoryId: idOf(reminder.subcategory),
    personId: idOf(reminder.person),
    projectId: idOf(reminder.project),
    todoId: idOf(reminder.todo),
    dueDate: reminder.dueDate ?? '',
    dueTime: reminder.dueTime ?? '',
    alertAt: toLocalInput(reminder.alertAt),
    trigger: reminder.trigger,
    priority: reminder.priority,
    repeatRule: reminder.repeat.rule,
    every: reminder.repeat.every === null ? '' : String(reminder.repeat.every),
    weekdays: reminder.repeat.weekdays,
});

const blankToNull = (text) => (text === '' ? null : text);

const repeatOf = (draft) => {
    if (draft.repeatRule === 'every_n_days') return { rule: 'every_n_days', every: Number(draft.every) };
    if (draft.repeatRule === 'weekly') {
        return {
            rule: 'weekly',
            weekdays: WEEKDAYS.map((day) => day.value).filter((day) => draft.weekdays.includes(day)),
        };
    }
    return { rule: draft.repeatRule };
};

export const toPayload = (draft) => ({
    title: draft.title.trim(),
    placeId: draft.placeId,
    subcategoryId: draft.subcategoryId,
    personId: draft.personId,
    projectId: draft.projectId,
    todoId: draft.todoId,
    dueDate: blankToNull(draft.dueDate),
    dueTime: blankToNull(draft.dueTime),
    alertAt: draft.alertAt === '' ? null : new Date(draft.alertAt).toISOString(),
    trigger: draft.trigger,
    priority: draft.priority,
    repeat: repeatOf(draft),
});

// The messages to show, empty when the draft can be saved.
export const validate = (draft) => {
    const errors = [];
    if (draft.title.trim() === '') errors.push('Title is required.');
    if (draft.dueTime !== '' && draft.dueDate === '') errors.push('A due time needs a due date.');
    if (draft.repeatRule === 'every_n_days' && !(Number(draft.every) > 0)) {
        errors.push('Repeat every needs a number of days above 0.');
    }
    if (draft.repeatRule === 'weekly' && draft.weekdays.length === 0) {
        errors.push('Weekly needs at least one weekday.');
    }
    return errors;
};
