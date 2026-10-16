'use strict';

const crypto = require('crypto');

const { withConnection } = require('../db/unitOfWork');
const travelTimesRepo = require('../db/repositories/travelTimesRepo');
const { computeDrive } = require('./google/routesApi');

const CACHE_MAX_AGE_DAYS = 30;
const HOURS_PER_WEEK = 168;
const MS_PER_HOUR = 3600000;
const MS_PER_WEEK = HOURS_PER_WEEK * MS_PER_HOUR;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const hashAddress = (address) =>
    crypto
        .createHash('sha256')
        .update(address.toLowerCase().trim().replace(/\s+/g, ' '))
        .digest('hex');

const mapsUrlFor = (originAddress, destinationAddress) =>
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${encodeURIComponent(originAddress)}` +
    `&destination=${encodeURIComponent(destinationAddress)}` +
    '&travelmode=driving';

// Hour of the week, 0 (Sunday 00:00) to 167, as the wall clock reads in timeZone.
const hourOfWeek = (date, timeZone) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
            .formatToParts(date)
            .map(({ type, value }) => [type, value])
    );
    return WEEKDAYS.indexOf(parts.weekday) * 24 + Number(parts.hour);
};

// Smallest signed hour difference between two buckets, in [-84, 84).
const bucketGap = (from, to) =>
    ((((to - from) % HOURS_PER_WEEK) + HOURS_PER_WEEK + HOURS_PER_WEEK / 2) % HOURS_PER_WEEK) -
    HOURS_PER_WEEK / 2;

// Same local weekday and hour as departAt, a whole number of weeks on, strictly after now.
const nextOccurrence = (departAt, timeZone, now) => {
    const bucket = hourOfWeek(departAt, timeZone);
    let weeks = 0;
    for (;;) {
        const shifted = new Date(departAt.getTime() + weeks * MS_PER_WEEK);
        // A DST change in between shifts the wall clock by an hour; undo it.
        const candidate = new Date(
            shifted.getTime() + bucketGap(hourOfWeek(shifted, timeZone), bucket) * MS_PER_HOUR
        );
        if (candidate > now) return candidate;
        weeks += 1;
    }
};

const travelBetween = async ({ originAddress, destinationAddress, departAt, timeZone, now }) => {
    const mapsUrl = mapsUrlFor(originAddress, destinationAddress);
    const originHash = hashAddress(originAddress);
    const destinationHash = hashAddress(destinationAddress);
    const bucket = hourOfWeek(departAt, timeZone);

    const cached = await withConnection((conn) =>
        travelTimesRepo.findFresh(conn, originHash, destinationHash, bucket, CACHE_MAX_AGE_DAYS)
    );
    if (cached) {
        return {
            status: 'ok',
            durationSeconds: cached.duration_seconds,
            distanceMeters: cached.distance_meters,
            mapsUrl,
        };
    }

    const apiKey = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim();
    if (!apiKey) return { status: 'unavailable', mapsUrl };

    let drive;
    try {
        drive = await computeDrive(apiKey, {
            originAddress,
            destinationAddress,
            departureTime: nextOccurrence(departAt, timeZone, now).toISOString(),
        });
    } catch {
        return { status: 'unavailable', mapsUrl };
    }

    await withConnection((conn) =>
        travelTimesRepo.upsert(conn, { originHash, destinationHash, bucket, ...drive })
    );
    return { status: 'ok', ...drive, mapsUrl };
};

module.exports = { travelBetween };
