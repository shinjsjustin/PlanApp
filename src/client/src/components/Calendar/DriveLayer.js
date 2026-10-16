import React from 'react';

import { usePlaceOptions } from '../../hooks/usePlaceOptions';
import useDriveTimes from '../../hooks/useDriveTimes';
import { legsForDay } from '../../lib/driveLegs';
import { todayKey } from '../../lib/dates';
import { useDayGeometry } from '../../state/DayScaleContext';

const SECONDS_PER_MINUTE = 60;
const UNAVAILABLE_BLOCK_MINUTES = 15;

const DriveBlock = ({ leg, answer, placeName }) => {
    const geometry = useDayGeometry();
    const isOk = answer.status === 'ok';
    const minutes = isOk
        ? Math.ceil(answer.durationSeconds / SECONDS_PER_MINUTE)
        : UNAVAILABLE_BLOCK_MINUTES;
    const startMinutes = Math.max(0, leg.startMinutes - minutes);

    return (
        <div
            className="calendar-drive"
            aria-label={`Drive to ${placeName}`}
            style={{
                top: `${geometry.minutesToPx(startMinutes)}px`,
                height: `${geometry.minutesToPx(minutes)}px`,
            }}
        >
            <span>{isOk ? `Drive ${minutes} min` : 'Drive time unavailable'}</span>
            {answer.mapsUrl && (
                <a href={answer.mapsUrl} target="_blank" rel="noopener noreferrer">
                    Maps
                </a>
            )}
        </div>
    );
};

const DriveBlocks = ({ date, items, events, places, startPlaceId }) => {
    const legs = legsForDay({ date: date ?? todayKey(), items, events, places, startPlaceId });
    const answers = useDriveTimes(legs);

    return legs
        .filter((leg) => answers[leg.key])
        .map((leg) => (
            <DriveBlock
                key={leg.key}
                leg={leg}
                answer={answers[leg.key]}
                placeName={places.find((place) => place.id === leg.toPlaceId).name}
            />
        ));
};

/** The drives into each placed stop of one day, drawn behind the cards. */
const DriveLayer = ({ date, items, events }) => {
    const options = usePlaceOptions();
    if (!options || options.status !== 'ready') return null;

    return (
        <DriveBlocks
            date={date}
            items={items}
            events={events}
            places={options.places}
            startPlaceId={options.startPlaceId}
        />
    );
};

export default DriveLayer;
