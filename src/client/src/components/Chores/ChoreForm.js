import React, { useEffect, useState } from 'react';

import { emptyDraft, fromChore, toPayload, validate } from '../../lib/choreForm';
import '../Styling/Places.css';

// Controlled form for a new chore or an edit. `onSubmit(payload)` is called
// only with a valid draft; the parent reports a failed save through `saveFailed`.
export default function ChoreForm({ chore, saveFailed, onSubmit, onCancel, onDirtyChange }) {
    const [startDraft] = useState(chore ? fromChore(chore) : emptyDraft());
    const [draft, setDraft] = useState(startDraft);
    const [errors, setErrors] = useState({});
    const isDirty = JSON.stringify(draft) !== JSON.stringify(startDraft);

    useEffect(() => {
        if (onDirtyChange) onDirtyChange(isDirty);
    }, [isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

    const setField = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));

    const submit = (event) => {
        event.preventDefault();
        const found = validate(draft);
        setErrors(found);
        if (Object.keys(found).length === 0) onSubmit(toPayload(draft));
    };

    return (
        <form className="place-form" onSubmit={submit} noValidate>
            <label className="place-field">
                Name
                <input className="place-input" type="text" value={draft.name} onChange={setField('name')} />
            </label>
            <label className="place-field">
                Area
                <input className="place-input" type="text" value={draft.area} onChange={setField('area')} />
            </label>
            <label className="place-field">
                Window (days)
                <input className="place-input" type="text" value={draft.window} onChange={setField('window')} />
            </label>
            <p className="place-hint">Enter N or N-M days, like 7 or 7-10.</p>
            <label className="place-field">
                Notes
                <textarea className="place-input" value={draft.notes} onChange={setField('notes')} />
            </label>

            {Object.values(errors).map((message) => (
                <p key={message} className="places-error" role="alert">{message}</p>
            ))}
            {saveFailed && <p className="places-error" role="alert">Could not save the chore. Please try again.</p>}

            <div className="place-actions">
                <button type="submit" className="neon-button">Save</button>
                {onCancel && <button type="button" className="neon-button" onClick={onCancel}>Cancel</button>}
            </div>
        </form>
    );
}
