import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import useIsPhone from '../../hooks/useIsPhone';
import usePeople from '../../hooks/usePeople';
import usePlaces from '../../hooks/usePlaces';
import { PERSON_GROUPS } from './PersonForm';
import PeopleSection from './PeopleSection';
import PlacesSection from './PlacesSection';
import '../Styling/Places.css';
import '../Styling/AddressBook.css';

const AddressBookPage = () => {
    const isPhone = useIsPhone();
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('');
    const people = usePeople();
    const places = usePlaces();

    // A place's name is embedded in each person, so people must refresh after a place changes.
    const afterPlaceChange = (call) => async (...args) => {
        const didChange = await call(...args);
        if (didChange) people.reload();
        return didChange;
    };

    return (
        <main className={isPhone ? 'address-book-page address-book-page--phone' : 'address-book-page'}>
            <header className="places-header">
                <h1>Address Book</h1>
                {!isPhone && (
                    <>
                        <Link className="neon-button" to="/projects">Projects</Link>
                        <Link className="neon-button" to="/calendar">Calendar</Link>
                        <Link className="neon-button" to="/thoughts">Thoughts</Link>
                    </>
                )}
            </header>

            {people.error && <p role="alert" className="places-error">{people.error}</p>}
            {places.error && <p role="alert" className="places-error">{places.error}</p>}

            <div className="address-book-filters">
                <label>
                    Search
                    <input
                        type="search"
                        className="place-input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
                <label>
                    Group
                    <select className="place-input" value={group} onChange={(event) => setGroup(event.target.value)}>
                        <option value="">All groups</option>
                        {PERSON_GROUPS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>
            </div>

            <PeopleSection
                people={people.people}
                places={places.places}
                query={query}
                group={group}
                status={people.status}
                onAdd={people.add}
                onEdit={people.edit}
                onRemove={people.remove}
            />
            <PlacesSection
                places={places.places}
                startPlaceId={places.startPlaceId}
                status={places.status}
                query={query}
                onAdd={places.add}
                onEdit={afterPlaceChange(places.edit)}
                onRemove={afterPlaceChange(places.remove)}
                onSetStart={places.setStart}
            />
        </main>
    );
};

export default AddressBookPage;
