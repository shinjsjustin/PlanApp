import React from 'react';
import { Link } from 'react-router-dom';

import { formatTime } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';

const REMINDER_BLOCK_MINUTES = 30;

// Reminders are fixed markers: shown, never dragged or resized. A tap opens the
// Reminders page, where they are edited.
const ReminderBlock = ({ reminder }) => {
    const geometry = useDayGeometry();

    return (
        <Link
            to="/reminders"
            className="calendar-reminder"
            aria-label={`Reminder: ${reminder.title}`}
            style={{
                top: `${geometry.minutesToPx(reminder.startMinutes)}px`,
                height: `${geometry.minutesToPx(REMINDER_BLOCK_MINUTES)}px`,
            }}
        >
            <span className="calendar-reminder-title">{reminder.title}</span>
            <span className="calendar-reminder-time">
                {formatTime(reminder.startMinutes)}
                {reminder.priority === 'high' && ' · High priority'}
            </span>
        </Link>
    );
};

/** The timed reminders of one day; render after EventLayer so they paint above events. */
const ReminderLayer = ({ reminders }) =>
    reminders.map((reminder) => <ReminderBlock key={reminder.id} reminder={reminder} />);

export default ReminderLayer;
