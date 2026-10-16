import React from 'react';

import { usePlaceOptions } from '../../hooks/usePlaceOptions';
import '../Styling/Places.css';

const NO_PLACE = '';

const PlaceSelect = ({ value, onChange }) => {
    const options = usePlaceOptions();
    if (!options) return null;

    if (options.status === 'error') {
        return (
            <label className="place-select">
                Place
                <select disabled value={NO_PLACE}>
                    <option value={NO_PLACE}>Places unavailable</option>
                </select>
            </label>
        );
    }

    return (
        <label className="place-select">
            Place
            <select
                value={value ?? NO_PLACE}
                onChange={(event) =>
                    onChange(event.target.value === NO_PLACE ? null : Number(event.target.value))
                }
            >
                <option value={NO_PLACE}>No place</option>
                {options.places.map((place) => (
                    <option key={place.id} value={place.id}>
                        {place.name}
                    </option>
                ))}
            </select>
        </label>
    );
};

export default PlaceSelect;
