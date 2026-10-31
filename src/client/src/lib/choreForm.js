// Pure helpers behind the chore form. A draft holds input strings; toPayload shapes it for the API.

const MIN_DAYS = 1;
const MAX_DAYS = 365;
const WINDOW_PATTERN = /^(\d+)(?:\s*-\s*(\d+))?$/;

export const emptyDraft = () => ({ name: '', area: '', window: '', notes: '' });

/** '7' or '7-10' as { min, max }, or null when blank, out of 1-365 or min above max. */
export const parseWindow = (text) => {
    const match = WINDOW_PATTERN.exec(String(text).trim());
    if (!match) return null;
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : Number(match[2]);
    if (min < MIN_DAYS || max > MAX_DAYS || min > max) return null;
    return { min, max };
};

const formatRange = ({ min, max }) => (min === max ? String(min) : `${min}-${max}`);

export const formatWindow = (window) => {
    const days = window.min === 1 && window.max === 1 ? 'day' : 'days';
    return `${formatRange(window)} ${days}`;
};

export const fromChore = (chore) => ({
    name: chore.name,
    area: chore.area || '',
    window: formatRange(chore.window),
    notes: chore.notes || '',
});

export const validate = (draft) => {
    const errors = {};
    if (!draft.name.trim()) errors.name = 'Enter a name.';
    if (!parseWindow(draft.window)) errors.window = `Enter whole days from ${MIN_DAYS} to ${MAX_DAYS}, like 7 or 7-10.`;
    return errors;
};

const orNull = (text) => text.trim() || null;

export const toPayload = (draft) => ({
    name: draft.name.trim(),
    area: orNull(draft.area),
    window: parseWindow(draft.window),
    notes: orNull(draft.notes),
});
