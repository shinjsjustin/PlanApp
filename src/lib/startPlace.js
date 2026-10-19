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

/**
 * The `{ places, startPlaceId }` payload shared by the app and Bourne routes.
 * `q` keeps places whose name contains it; the start is still found among all.
 */
const placesPayload = async (ownerId, { q } = {}) => {
    const rows = await withConnection((conn) => placesRepo.listByOwner(conn, ownerId));
    const places = rows.map(toPlace);

    const needle = q?.toLowerCase();
    const matching = needle ? places.filter((place) => place.name.toLowerCase().includes(needle)) : places;

    return { places: matching, startPlaceId: startPlaceId(places) };
};

module.exports = { placesPayload, startPlaceId };
