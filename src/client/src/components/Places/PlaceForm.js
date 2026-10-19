import React, { useState } from 'react';

export const PLACE_KINDS = ['home', 'work', 'client', 'church', 'supplier', 'other'];

const VISIT_STEP_MINUTES = 30;
const MAX_VISIT_MINUTES = 720;
const MINUTES_PER_HOUR = 60;

export const VISIT_OPTIONS = Array.from(
    { length: MAX_VISIT_MINUTES / VISIT_STEP_MINUTES },
    (_, index) => (index + 1) * VISIT_STEP_MINUTES
);

// 30 -> "30 min", 60 -> "1 h", 90 -> "1 h 30 min".
export const formatVisit = (minutes) => {
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;
    if (hours === 0) return `${rest} min`;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

const EMPTY = { name: '', address: '', kind: 'home', notes: '', visitMinutes: '' };

const toDraft = (place) => ({
    name: place.name,
    address: place.address,
    kind: place.kind,
    notes: place.notes ?? '',
    visitMinutes: place.visitMinutes === null ? '' : String(place.visitMinutes),
});

// Controlled form for a new place or an edit. `onSubmit(fields)` resolves true
// when saved; `clearOnSuccess` empties the form then (for the New place form).
const PlaceForm = ({ initial, submitLabel, onSubmit, onCancel, clearOnSuccess = false }) => {
    const [draft, setDraft] = useState(initial ? toDraft(initial) : EMPTY);
    const [isSaving, setIsSaving] = useState(false);
    const isValid = draft.name.trim() !== '' && draft.address.trim() !== '';

    const setField = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));

    const submit = async (event) => {
        event.preventDefault();
        if (!isValid || isSaving) return;
        setIsSaving(true);
        const didSave = await onSubmit({
            name: draft.name.trim(),
            address: draft.address.trim(),
            kind: draft.kind,
            notes: draft.notes.trim() === '' ? null : draft.notes,
            visitMinutes: draft.visitMinutes === '' ? null : Number(draft.visitMinutes),
        });
        setIsSaving(false);
        if (didSave && clearOnSuccess) setDraft(EMPTY);
    };

    return (
        <form className="place-form" onSubmit={submit}>
            <label className="place-field">
                Name
                <input className="place-input" type="text" value={draft.name} onChange={setField('name')} />
            </label>
            <label className="place-field">
                Address
                <input className="place-input" type="text" value={draft.address} onChange={setField('address')} />
            </label>
            <label className="place-field">
                Kind
                <select className="place-input" value={draft.kind} onChange={setField('kind')}>
                    {PLACE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>{kind}</option>
                    ))}
                </select>
            </label>
            <label className="place-field">
                Notes
                <textarea className="place-input" value={draft.notes} onChange={setField('notes')} />
            </label>
            <label className="place-field">
                Usual visit
                <select className="place-input" value={draft.visitMinutes} onChange={setField('visitMinutes')}>
                    <option value="">None</option>
                    {VISIT_OPTIONS.map((minutes) => (
                        <option key={minutes} value={String(minutes)}>{formatVisit(minutes)}</option>
                    ))}
                </select>
            </label>
            <div className="place-actions">
                <button type="submit" className="neon-button" disabled={!isValid || isSaving}>{submitLabel}</button>
                {onCancel && (
                    <button type="button" className="neon-button" onClick={onCancel}>Cancel</button>
                )}
            </div>
        </form>
    );
};

export default PlaceForm;
