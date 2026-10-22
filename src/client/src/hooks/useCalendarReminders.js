import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';
import { groupRemindersByDate } from '../lib/calendarReminders';

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

// One shared empty list, so every date without reminders hands back the same array.
const EMPTY_BLOCKS = [];
const NO_REMINDERS = [];

// Anything that is not an object holding a `reminders` array counts as none.
const readReminders = (payload) =>
    Array.isArray(payload?.reminders) ? payload.reminders : NO_REMINDERS;

const useCalendarReminders = () => {
    const [reminders, setReminders] = useState(NO_REMINDERS);
    const [loadError, setLoadError] = useState(null);

    const reload = useCallback(async () => {
        try {
            setReminders(readReminders(await api.get('/reminders?status=open')));
            setLoadError(null);
        } catch (err) {
            console.error('[calendar reminders] load failed', err);
            setLoadError(err?.message || GENERIC_FAILURE);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const blocksByDate = useMemo(() => groupRemindersByDate(reminders), [reminders]);

    const remindersForDate = useCallback(
        (dateKey) => blocksByDate.get(dateKey) ?? EMPTY_BLOCKS,
        [blocksByDate]
    );

    return useMemo(
        () => ({ remindersForDate, loadError, reload }),
        [remindersForDate, loadError, reload]
    );
};

export default useCalendarReminders;
