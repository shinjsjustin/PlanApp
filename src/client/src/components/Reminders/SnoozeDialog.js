import React, { useState } from 'react';

import FormDialog from '../AddressBook/FormDialog';
import '../Styling/Places.css';
import '../Styling/Reminders.css';

const HOUR_MS = 60 * 60 * 1000;
const TOMORROW_HOUR = 9;

const inOneHour = (now) => new Date(now.getTime() + HOUR_MS);
const tomorrowMorning = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, TOMORROW_HOUR, 0, 0);

// Pop-up that picks when a reminder returns. Presets come from `now` so they are fixed in tests.
const SnoozeDialog = ({ now, error: submitError, onSnooze, onCancel }) => {
    const [custom, setCustom] = useState('');
    const [error, setError] = useState(null);

    const snoozeCustom = () => {
        const until = new Date(custom);
        if (custom === '' || Number.isNaN(until.getTime()) || until <= now) {
            setError('Pick a time in the future.');
            return;
        }
        onSnooze(until.toISOString());
    };

    return (
        <FormDialog title="Snooze reminder" isDirty={false} error={error || submitError} onClose={onCancel}>
            <div className="snooze-presets">
                <button type="button" className="neon-button" onClick={() => onSnooze(inOneHour(now).toISOString())}>1 hour</button>
                <button type="button" className="neon-button" onClick={() => onSnooze(tomorrowMorning(now).toISOString())}>Tomorrow 9:00</button>
            </div>
            <label>
                Custom time
                <input
                    type="datetime-local"
                    className="place-input"
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                />
            </label>
            <div className="place-actions">
                <button type="button" className="neon-button" onClick={snoozeCustom}>Snooze until custom time</button>
                <button type="button" className="neon-button" onClick={onCancel}>Cancel</button>
            </div>
        </FormDialog>
    );
};

export default SnoozeDialog;
