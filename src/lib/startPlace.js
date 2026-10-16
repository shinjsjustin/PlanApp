'use strict';

const placesRepo = require('../db/repositories/placesRepo');
const { toPlace } = require('./serializers');
const { withConnection } = require('../db/unitOfWork');

/**
 * Where a day starts: the marked place, else the oldest (lowest-id) home, else
 * null. Takes serialized places.
 */
const startPlaceId = (places) => {
    const marked = places.find((place) => place.isDefaultStart);
    if (marked) return marked.id;

    const homeIds = places.filter((place) => place.kind === 'home').map((place) => place.id);

    return homeIds.length > 0 ? Math.min(...homeIds) : null;
};

/** The `{ places, startPlaceId }` payload shared by the app and Bourne routes. */
const placesPayload = async (ownerId) => {
    const rows = await withConnection((conn) => placesRepo.listByOwner(conn, ownerId));
    const places = rows.map(toPlace);

    return { places, startPlaceId: startPlaceId(places) };
};

module.exports = { placesPayload, startPlaceId };
