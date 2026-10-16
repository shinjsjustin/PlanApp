import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import useIsPhone from '../../hooks/useIsPhone';
import usePlaces from '../../hooks/usePlaces';
import PlaceForm, { formatVisit } from './PlaceForm';
import '../Styling/Places.css';

const deleteConfirmation = (place) => `Delete ${place.name}?`;

const PlaceItem = ({ place, isStart, onEdit, onRemove, onSetStart }) => {
    const [isEditing, setIsEditing] = useState(false);

    const save = async (fields) => {
        const didSave = await onEdit(place.id, fields);
        if (didSave) setIsEditing(false);
        return didSave;
    };

    const confirmRemove = () => {
        if (window.confirm(deleteConfirmation(place))) onRemove(place.id);
    };

    if (isEditing) {
        return (
            <li className="place-item">
                <PlaceForm initial={place} submitLabel="Save" onSubmit={save} onCancel={() => setIsEditing(false)} />
            </li>
        );
    }

    return (
        <li className="place-item">
            <h2 className="place-name">{place.name}</h2>
            {isStart && <span className="place-badge">Starting place</span>}
            <span className="place-kind">{place.kind}</span>
            <p className="place-address">{place.address}</p>
            {place.visitMinutes !== null && <p className="place-visit">{formatVisit(place.visitMinutes)}</p>}
            <div className="place-actions">
                <button type="button" className="neon-button" onClick={() => setIsEditing(true)}>Edit</button>
                <button type="button" className="neon-button" onClick={confirmRemove}>Delete</button>
                {!isStart && (
                    <button type="button" className="neon-button" onClick={() => onSetStart(place.id)}>Make starting place</button>
                )}
            </div>
        </li>
    );
};

const PlacesPage = () => {
    const isPhone = useIsPhone();
    const { status, places, startPlaceId, error, add, edit, remove, setStart } = usePlaces();

    return (
        <main className={isPhone ? 'places-page places-page--phone' : 'places-page'}>
            <header className="places-header">
                <h1>Places</h1>
                {!isPhone && (
                    <>
                        <Link className="neon-button" to="/projects">Projects</Link>
                        <Link className="neon-button" to="/calendar">Calendar</Link>
                        <Link className="neon-button" to="/thoughts">Thoughts</Link>
                    </>
                )}
            </header>

            {error && <p role="alert" className="places-error">{error}</p>}

            <section className="place-new" aria-labelledby="place-new-heading">
                <h2 id="place-new-heading">New place</h2>
                <PlaceForm submitLabel="Add place" onSubmit={add} clearOnSuccess />
            </section>

            {status === 'loading' ? (
                <p>Loading places…</p>
            ) : (
                <ul className="place-list">
                    {places.map((place) => (
                        <PlaceItem
                            key={place.id}
                            place={place}
                            isStart={place.id === startPlaceId}
                            onEdit={edit}
                            onRemove={remove}
                            onSetStart={setStart}
                        />
                    ))}
                </ul>
            )}
        </main>
    );
};

export default PlacesPage;
