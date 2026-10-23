'use strict';

const DEFAULT_TIME_ZONE = 'America/Los_Angeles';
const DEFAULT_NAME = 'Justin';
const VERBS = { arrive: 'arrived at', leave: 'left' };

const isValidTimeZone = (timeZone) => {
    if (!timeZone) return false;
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone });
        return true;
    } catch {
        return false;
    }
};

const clockTime = (at, timeZone) =>
    new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(at);

// Only name, place, verb and time: no coordinates or ids leave the server.
const formatPlaceLine = ({ ownerName, placeName, event, at, timeZone }) => {
    const name = String(ownerName || '').trim().split(/\s+/)[0] || DEFAULT_NAME;
    return `${name} ${VERBS[event]} ${placeName} ${clockTime(at, timeZone)}`;
};

const placeForwardConfig = (env) => {
    const url = env.BOURNE_PLACE_URL;
    const token = env.BOURNE_PLACE_TOKEN;
    if (!url || !token) return null;
    const zone = env.BOURNE_PLACE_TIME_ZONE;
    return { url, token, timeZone: isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE };
};

module.exports = { formatPlaceLine, placeForwardConfig, DEFAULT_TIME_ZONE };
