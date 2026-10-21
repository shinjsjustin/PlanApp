import React from 'react';

import { PERSON_GROUPS } from './PersonForm';
import { formatPhone } from '../../lib/phoneNumber';
import '../Styling/AddressBook.css';

const GROUP_LABELS = Object.fromEntries(PERSON_GROUPS.map(({ value, label }) => [value, label]));

const deleteConfirmation = (person) => `Delete ${person.name}?`;

const matchesQuery = (person, query) => {
    const needle = query.trim().toLowerCase();
    return [person.name, person.company ?? ''].some((text) => text.toLowerCase().includes(needle));
};

const isCompany = (person, text) => text.trim().toLowerCase() === (person.company ?? '').trim().toLowerCase();

const phoneText = ({ label, number }) =>
    label ? `${label}: ${formatPhone(number)}` : formatPhone(number);

const PersonItem = ({ person, onOpenEdit, onRemove }) => {
    const confirmRemove = () => {
        if (window.confirm(deleteConfirmation(person))) onRemove(person.id);
    };

    return (
        <li className="person-item">
            <h3 className="person-name">{person.name}</h3>
            {person.company && <p className="person-company">{person.company}</p>}
            {person.role && !isCompany(person, person.role) && <p className="person-role">{person.role}</p>}
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
                    {phoneText(phone)}
                </a>
            ))}
            {person.place && <p className="person-place">{person.place.name}</p>}
            {person.leemacClientName && !isCompany(person, person.leemacClientName) && <p className="person-client">{person.leemacClientName}</p>}
            <div className="place-actions">
                <button type="button" className="neon-button" onClick={() => onOpenEdit(person)}>Edit</button>
                <button type="button" className="neon-button" onClick={confirmRemove}>Delete</button>
            </div>
        </li>
    );
};

const PeopleSection = ({ people, query, group, status, onOpenEdit, onRemove }) => {
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
                    <PersonItem key={person.id} person={person} onOpenEdit={onOpenEdit} onRemove={onRemove} />
                ))}
            </ul>
        );
    };

    return (
        <section className="people-section" aria-labelledby="people-heading">
            <h2 id="people-heading">People</h2>
            {renderList()}
        </section>
    );
};

export default PeopleSection;
