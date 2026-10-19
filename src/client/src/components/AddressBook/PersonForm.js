import React, { useState } from 'react';

export const PERSON_GROUPS = [
    { value: 'family', label: 'Family' },
    { value: 'friend', label: 'Friend' },
    { value: 'client_contact', label: 'Client contact' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'church', label: 'Church' },
    { value: 'other', label: 'Other' },
];

const PHONE_LABEL_SUGGESTIONS = ['office', 'cell', 'home'];
const PHONE_LABELS_LIST_ID = 'person-phone-labels';

const EMPTY = {
    name: '',
    company: '',
    role: '',
    emails: [],
    phones: [],
    groups: [],
    notes: '',
    placeId: '',
    leemacClientId: '',
    leemacClientName: '',
};

const toDraft = (person) => ({
    name: person.name,
    company: person.company ?? '',
    role: person.role ?? '',
    emails: person.emails,
    phones: person.phones,
    groups: person.groups,
    notes: person.notes ?? '',
    placeId: person.place ? String(person.place.id) : '',
    leemacClientId: person.leemacClientId ?? '',
    leemacClientName: person.leemacClientName ?? '',
});

const trimmedOrNull = (text) => (text.trim() === '' ? null : text.trim());

const replaceAt = (list, index, value) => list.map((item, i) => (i === index ? value : item));
const removeAt = (list, index) => list.filter((_, i) => i !== index);

// Controlled form for a new person or an edit. `onSubmit(fields)` resolves true
// when saved; `clearOnSuccess` empties the form then (for the New person form).
const PersonForm = ({ initial, places, submitLabel, onSubmit, onCancel, clearOnSuccess = false }) => {
    const [draft, setDraft] = useState(initial ? toDraft(initial) : EMPTY);
    const [isSaving, setIsSaving] = useState(false);
    const isValid = draft.name.trim() !== '';

    const update = (changes) => setDraft((current) => ({ ...current, ...changes }));
    const setField = (field) => (event) => update({ [field]: event.target.value });

    const toggleGroup = (group) => (event) =>
        update({
            groups: event.target.checked
                ? [...draft.groups, group]
                : draft.groups.filter((existing) => existing !== group),
        });

    const submit = async (event) => {
        event.preventDefault();
        if (!isValid || isSaving) return;
        setIsSaving(true);
        const didSave = await onSubmit({
            name: draft.name.trim(),
            company: trimmedOrNull(draft.company),
            role: trimmedOrNull(draft.role),
            emails: draft.emails.map((email) => email.trim()).filter((email) => email !== ''),
            phones: draft.phones
                .filter((phone) => phone.number.trim() !== '')
                .map((phone) => ({ label: phone.label.trim(), number: phone.number.trim() })),
            groups: PERSON_GROUPS.map((group) => group.value).filter((value) => draft.groups.includes(value)),
            notes: trimmedOrNull(draft.notes),
            placeId: draft.placeId === '' ? null : Number(draft.placeId),
            leemacClientId: trimmedOrNull(draft.leemacClientId),
            leemacClientName: trimmedOrNull(draft.leemacClientName),
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
                Company
                <input className="place-input" type="text" value={draft.company} onChange={setField('company')} />
            </label>
            <label className="place-field">
                Role
                <input className="place-input" type="text" value={draft.role} onChange={setField('role')} />
            </label>

            <div className="place-field">
                Emails
                {draft.emails.map((email, index) => (
                    <div key={index}>
                        <input
                            className="place-input"
                            type="email"
                            aria-label={`Email ${index + 1}`}
                            value={email}
                            onChange={(event) => update({ emails: replaceAt(draft.emails, index, event.target.value) })}
                        />
                        <button
                            type="button"
                            className="neon-button"
                            aria-label={`Remove email ${index + 1}`}
                            onClick={() => update({ emails: removeAt(draft.emails, index) })}
                        >
                            Remove
                        </button>
                    </div>
                ))}
                <button type="button" className="neon-button" onClick={() => update({ emails: [...draft.emails, ''] })}>
                    Add email
                </button>
            </div>

            <div className="place-field">
                Phones
                <datalist id={PHONE_LABELS_LIST_ID}>
                    {PHONE_LABEL_SUGGESTIONS.map((label) => (
                        <option key={label} value={label} />
                    ))}
                </datalist>
                {draft.phones.map((phone, index) => (
                    <div key={index}>
                        <input
                            className="place-input"
                            type="text"
                            list={PHONE_LABELS_LIST_ID}
                            aria-label={`Phone label ${index + 1}`}
                            value={phone.label}
                            onChange={(event) =>
                                update({ phones: replaceAt(draft.phones, index, { ...phone, label: event.target.value }) })
                            }
                        />
                        <input
                            className="place-input"
                            type="tel"
                            aria-label={`Phone number ${index + 1}`}
                            value={phone.number}
                            onChange={(event) =>
                                update({ phones: replaceAt(draft.phones, index, { ...phone, number: event.target.value }) })
                            }
                        />
                        <button
                            type="button"
                            className="neon-button"
                            aria-label={`Remove phone ${index + 1}`}
                            onClick={() => update({ phones: removeAt(draft.phones, index) })}
                        >
                            Remove
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="neon-button"
                    onClick={() => update({ phones: [...draft.phones, { label: '', number: '' }] })}
                >
                    Add phone
                </button>
            </div>

            <fieldset className="place-field">
                <legend>Groups</legend>
                {PERSON_GROUPS.map(({ value, label }) => (
                    <label key={value}>
                        <input
                            type="checkbox"
                            checked={draft.groups.includes(value)}
                            onChange={toggleGroup(value)}
                        />
                        {label}
                    </label>
                ))}
            </fieldset>

            <label className="place-field">
                Notes
                <textarea className="place-input" value={draft.notes} onChange={setField('notes')} />
            </label>
            <label className="place-field">
                Place
                <select className="place-input" value={draft.placeId} onChange={setField('placeId')}>
                    <option value="">No place</option>
                    {places.map((place) => (
                        <option key={place.id} value={String(place.id)}>{place.name}</option>
                    ))}
                </select>
            </label>
            <label className="place-field">
                Leemac client id
                <input
                    className="place-input"
                    type="text"
                    value={draft.leemacClientId}
                    onChange={setField('leemacClientId')}
                />
            </label>
            <label className="place-field">
                Leemac client name
                <input
                    className="place-input"
                    type="text"
                    value={draft.leemacClientName}
                    onChange={setField('leemacClientName')}
                />
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

export default PersonForm;
