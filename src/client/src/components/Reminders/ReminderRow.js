import React from 'react';

import { formatAlert, formatDue, formatRepeat } from '../../lib/reminderLabels';
import '../Styling/Reminders.css';

const TRIGGER_LABELS = { arrive: 'Arrive', leave: 'Leave' };

export default function ReminderRow({ reminder, onDone, onDismiss, onSnooze, onReopen, onEdit, onDelete }) {
    const { title, place, subcategory, person, project, todo, dueDate, dueTime, alertAt, trigger, priority,
        snoozedUntil, repeat, overdue, status } = reminder;
    const details = Object.entries({
        place: place && place.label,
        subcategory: subcategory && subcategory.label,
        due: formatDue(dueDate, dueTime),
        alert: formatAlert(alertAt),
        trigger: TRIGGER_LABELS[trigger],
        person: person && person.label,
        project: project && project.label,
        todo: todo && todo.label,
        repeat: formatRepeat(repeat),
        snoozed: snoozedUntil && `Snoozed until ${formatAlert(snoozedUntil)}`,
    }).filter(([, text]) => text);
    const act = (handler) => () => handler(reminder);

    return (
        <li className="reminder-row">
            <div className="reminder-title">
                <span>{title}</span>
                {priority === 'high' && <span className="reminder-badge">High priority</span>}
                {overdue && <span className="reminder-badge reminder-badge--overdue">Overdue</span>}
            </div>
            {details.length > 0 && (
                <ul className="reminder-details">
                    {details.map(([field, text]) => <li key={field}>{text}</li>)}
                </ul>
            )}
            <div className="reminder-actions">
                {status === 'open' ? (
                    <>
                        <button type="button" onClick={act(onDone)}>Done</button>
                        <button type="button" onClick={act(onDismiss)}>Dismiss</button>
                        <button type="button" onClick={act(onSnooze)}>Snooze</button>
                        <button type="button" onClick={act(onEdit)}>Edit</button>
                    </>
                ) : (
                    <button type="button" onClick={act(onReopen)}>Reopen</button>
                )}
                <button type="button" onClick={act(onDelete)}>Delete</button>
            </div>
        </li>
    );
}
