import React, { useState } from 'react';

import PersonForm, { PERSON_GROUPS } from './PersonForm';
import '../Styling/AddressBook.css';

const GROUP_LABELS = Object.fromEntries(PERSON_GROUPS.map(({ value, label }) => [value, label]));

const deleteConfirmation = (person) => `Delete ${person.name}?`;

const matchesQuery = (person, query) => {
    const needle = query.trim().toLowerCase();
    return [person.name, person.company ?? ''].some((text) => text.toLowerCase().includes(needle));
};

const PersonItem = ({ person, places, onEdit, onRemove }) => {
    const [isEditing, setIsEditing] = useState(false);

    const save = async (fields) => {
        const didSave = await onEdit(person.id, fields);
        if (didSave) setIsEditing(false);
        return didSave;
    };

    const confirmRemove = () => {
        if (window.confirm(deleteConfirmation(person))) onRemove(person.id);
    };

    if (isEditing) {
        return (
            <li className="person-item">
                <PersonForm
                    initial={person}
                    places={places}
                    submitLabel="Save"
                    onSubmit={save}
                    onCancel={() => setIsEditing(false)}
                />
            </li>
        );
    }

    return (
        <li className="person-item">
            <h3 className="person-name">{person.name}</h3>
            {person.company && <p className="person-company">{person.company}</p>}
            {person.role && <p className="person-role">{person.role}</p>}
            {person.groups.length > 0 && (
                <ul className="person-groups">
                    {person.groups.map((group) => (
                        <li key={group} className="person-group">{GROUP_LABELS[group] ?? group}</li>
                    ))}
                </ul>
            )}
            {person.emails.map((email) => (
                <a key={email} className="person-link" href={`mailto:${email}`}>{email}</a>
            ))}
            {person.phones.map((phone, index) => (
                <a key={index} className="person-link" href={`tel:${phone.number}`}>
                    {`${phone.label}: ${phone.number}`}
                </a>
            ))}
            {person.place && <p className="person-place">{person.place.name}</p>}
            {person.leemacClientName && <p className="person-client">{person.leemacClientName}</p>}
            <div className="place-actions">
                <button type="button" className="neon-button" onClick={() => setIsEditing(true)}>Edit</button>
                <button type="button" className="neon-button" onClick={confirmRemove}>Delete</button>
            </div>
        </li>
    );
};

const PeopleSection = ({ people, places, query, group, status, onAdd, onEdit, onRemove }) => {
    const visible = people.filter(
        (person) => matchesQuery(person, query) && (group === '' || person.groups.includes(group))
    );

    const renderList = () => {
        if (status === 'loading') return <p>Loading people…</p>;
        if (people.length === 0) return <p>No people yet</p>;
        if (visible.length === 0) return <p>No people match</p>;
        return (
            <ul className="person-list">
                {visible.map((person) => (
                    <PersonItem key={person.id} person={person} places={places} onEdit={onEdit} onRemove={onRemove} />
                ))}
            </ul>
        );
    };

    return (
        <section className="people-section" aria-labelledby="people-heading">
            <h2 id="people-heading">People</h2>
            <div className="person-new">
                <h3>New person</h3>
                <PersonForm places={places} submitLabel="Add person" onSubmit={onAdd} clearOnSuccess />
            </div>
            {renderList()}
        </section>
    );
};

export default PeopleSection;
