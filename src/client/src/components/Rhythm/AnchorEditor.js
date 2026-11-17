import React, { useState } from 'react';

import { DAYS, draftOf, patchBodyOf } from '../../lib/rhythmWeek';
import '../Styling/Rhythm.css';

const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const AnchorEditor = ({ anchor, saveAnchor, onClose }) => {
    const [draft, setDraft] = useState(() => draftOf(anchor));
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const isEveryDay = DAYS.every((day) => draft.days.includes(day));

    const toggleDay = (day) =>
        setDraft((prev) => ({
            ...prev,
            days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
        }));

    const toggleEveryDay = () => setDraft((prev) => ({ ...prev, days: isEveryDay ? [] : [...DAYS] }));

    const handleSave = async () => {
        const { body, error: invalid } = patchBodyOf(anchor, draft);
        if (invalid) {
            setError(invalid);
            return;
        }
        if (!body) {
            onClose();
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            await saveAnchor(anchor.id, body);
            onClose();
        } catch (err) {
            setError(err?.message || 'Something went wrong. Please try again.');
            setIsSaving(false);
        }
    };

    return (
        <aside className="rhythm-card" aria-label={`Edit ${anchor.title}`}>
            <h3 className="rhythm-card-title">{anchor.title}</h3>
            <label>
                Time
                <input
                    type="time"
                    className="rhythm-input"
                    value={draft.time}
                    onChange={(e) => setDraft((prev) => ({ ...prev, time: e.target.value }))}
                />
            </label>
            <div className="rhythm-day-picker" role="group" aria-label="Days">
                {DAYS.map((day) => (
                    <button
                        key={day}
                        type="button"
                        className="rhythm-button"
                        aria-pressed={draft.days.includes(day)}
                        onClick={() => toggleDay(day)}
                    >
                        {DAY_LABELS[day]}
                    </button>
                ))}
                <button type="button" className="rhythm-button" aria-pressed={isEveryDay} onClick={toggleEveryDay}>
                    Every day
                </button>
            </div>
            <button
                type="button"
                role="switch"
                className="rhythm-button"
                aria-checked={draft.enabled}
                onClick={() => setDraft((prev) => ({ ...prev, enabled: !prev.enabled }))}
            >
                {draft.enabled ? 'On' : 'Off'}
            </button>
            {error && <p className="rhythm-error" role="alert">{error}</p>}
            <div className="rhythm-actions">
                <button type="button" className="rhythm-button" disabled={isSaving} onClick={handleSave}>Save</button>
                <button type="button" className="rhythm-button" onClick={onClose}>Cancel</button>
            </div>
        </aside>
    );
};

export default AnchorEditor;
