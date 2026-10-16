'use strict';

const { firstRow } = require('./sql');

/** Cached drive times, keyed by hashed origin, hashed destination and hour-of-week bucket. */

const findFresh = async (conn, originHash, destinationHash, bucket, maxAgeDays) => {
    const [rows] = await conn.execute(
        `SELECT origin_hash, destination_hash, bucket, duration_seconds, distance_meters, fetched_at
         FROM travel_times
         WHERE origin_hash = ? AND destination_hash = ? AND bucket = ?
           AND fetched_at >= NOW() - INTERVAL ? DAY`,
        [originHash, destinationHash, bucket, maxAgeDays]
    );

    return firstRow(rows) ?? null;
};

const upsert = async (conn, { originHash, destinationHash, bucket, durationSeconds, distanceMeters }) => {
    await conn.execute(
        `INSERT INTO travel_times (origin_hash, destination_hash, bucket, duration_seconds, distance_meters)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           duration_seconds = VALUES(duration_seconds),
           distance_meters = VALUES(distance_meters),
           fetched_at = CURRENT_TIMESTAMP`,
        [originHash, destinationHash, bucket, durationSeconds, distanceMeters]
    );
};

module.exports = { findFresh, upsert };
