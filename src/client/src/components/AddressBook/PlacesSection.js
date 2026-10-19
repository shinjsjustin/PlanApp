import React from 'react';

import { formatVisit } from '../Places/PlaceForm';
import '../Styling/Places.css';

const deleteConfirmation = (place) => `Delete ${place.name}?`;

const PlaceItem = ({ place, isStart, onOpenEdit, onRemove, onSetStart }) => {
    const confirmRemove = () => {
        if (window.confirm(deleteConfirmation(place))) onRemove(place.id);
    };

    return (
        <li className="place-item">
            <h2 className="place-name">{place.name}</h2>
            {isStart && <span className="place-badge">Starting place</span>}
            <span className="place-kind">{place.kind}</span>
            <p className="place-address">{place.address}</p>
            {place.visitMinutes !== null && <p className="place-visit">{formatVisit(place.visitMinutes)}</p>}
            <div className="place-actions">
                <button type="button" className="neon-button" onClick={() => onOpenEdit(place)}>Edit</button>
                <button type="button" className="neon-button" onClick={confirmRemove}>Delete</button>
                {!isStart && (
                    <button type="button" className="neon-button" onClick={() => onSetStart(place.id)}>Make starting place</button>
                )}
            </div>
        </li>
    );
};

const PlacesSection = ({ places, startPlaceId, status, query, onOpenEdit, onRemove, onSetStart }) => {
    const needle = query.trim().toLowerCase();
    const visible = places.filter((place) => place.name.toLowerCase().includes(needle));

    return (
        <section className="places-section" aria-labelledby="places-heading">
            <h2 id="places-heading">Places</h2>
            {status === 'loading' ? (
                <p>Loading places…</p>
            ) : (
                <ul className="place-list">
                    {visible.map((place) => (
                        <PlaceItem
                            key={place.id}
                            place={place}
                            isStart={place.id === startPlaceId}
                            onOpenEdit={onOpenEdit}
                            onRemove={onRemove}
                            onSetStart={onSetStart}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
};

export default PlacesSection;
