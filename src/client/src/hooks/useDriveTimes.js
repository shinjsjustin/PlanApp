import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { driveMinutesOf } from '../lib/driveLegs';

// Answers outlive the hook so remounting a calendar day never re-asks Bourne.
const cache = new Map();

const UNAVAILABLE = { status: 'unavailable', mapsUrl: null };

const UNKNOWN_DRIVE_MINUTES = 15;

const identityOf = (leg) => `${leg.fromPlaceId}|${leg.toPlaceId}|${leg.departAt}`;

const fetchLeg = (leg) =>
    api
        .get(
            '/bourne/travel?from=' + leg.fromPlaceId +
            '&to=' + leg.toPlaceId +
            '&departAt=' + encodeURIComponent(leg.departAt),
        )
        .catch((error) => {
            console.error('Could not fetch drive time', error);
            return UNAVAILABLE;
        });

const answersFor = (legs) =>
    legs.reduce((answers, leg) => {
        const answer = cache.get(identityOf(leg));
        return answer ? { ...answers, [leg.key]: answer } : answers;
    }, {});

// Synchronous, since the drag ghost recomputes on every pointer move: it reads
// whatever the cache already holds, newest answer for the pair at any departAt.
export const knownDriveMinutes = (fromPlaceId, toPlaceId) => {
    if (fromPlaceId === toPlaceId) return 0;

    const prefix = `${fromPlaceId}|${toPlaceId}|`;
    const answers = [...cache].filter(([identity]) => identity.startsWith(prefix));

    return answers.length > 0 ? driveMinutesOf(answers[answers.length - 1][1]) : UNKNOWN_DRIVE_MINUTES;
};

export const clearDriveTimeCache = () => cache.clear();

const useDriveTimes = (legs) => {
    const [, setVersion] = useState(0);
    const identities = legs.map(identityOf).join(',');

    useEffect(() => {
        let isActive = true;
        const missing = legs.filter((leg, i, all) =>
            !cache.has(identityOf(leg)) &&
            all.findIndex((other) => identityOf(other) === identityOf(leg)) === i);

        missing.forEach((leg) => {
            fetchLeg(leg).then((answer) => {
                cache.set(identityOf(leg), answer);
                if (isActive) setVersion((v) => v + 1);
            });
        });

        return () => {
            isActive = false;
        };
        // legs is compared by identity string so a fresh equal array does not refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [identities]);

    return answersFor(legs);
};

export default useDriveTimes;
