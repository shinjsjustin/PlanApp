import React from 'react';

import { usePlaceOptions } from '../../hooks/usePlaceOptions';
import useDriveTimes from '../../hooks/useDriveTimes';
import { DAY_START_MINUTES, driveMinutesOf, legsForDay } from '../../lib/driveLegs';
import { todayKey } from '../../lib/dates';
import { useDayGeometry } from '../../state/DayScaleContext';

const DriveBlock = ({ leg, answer, placeName }) => {
    const geometry = useDayGeometry();
    const isOk = answer.status === 'ok';
    const minutes = driveMinutesOf(answer);
    const startMinutes = Math.max(DAY_START_MINUTES, leg.startMinutes - minutes);

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

const DriveBlocks = ({ date, items, places, startPlaceId }) => {
    const legs = legsForDay({ date: date ?? todayKey(), items, places, startPlaceId });
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
const DriveLayer = ({ date, items }) => {
    const options = usePlaceOptions();
    if (!options || options.status !== 'ready') return null;

    return (
        <DriveBlocks
            date={date}
            items={items}
            places={options.places}
            startPlaceId={options.startPlaceId}
        />
    );
};

export default DriveLayer;
