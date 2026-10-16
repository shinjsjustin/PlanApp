'use strict';

const { HttpError } = require('../httpError');

const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = 'routes.duration,routes.distanceMeters';

const badGateway = () => new HttpError(502, 'Google Maps request failed');

// Drive time and distance between two addresses, traffic-aware at departureTime (ISO string).
const computeDrive = async (apiKey, { originAddress, destinationAddress, departureTime }) => {
    let response;
    try {
        response = await fetch(COMPUTE_ROUTES_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': FIELD_MASK,
            },
            body: JSON.stringify({
                origin: { address: originAddress },
                destination: { address: destinationAddress },
                travelMode: 'DRIVE',
                routingPreference: 'TRAFFIC_AWARE',
                departureTime,
            }),
        });
    } catch {
        throw badGateway();
    }
    if (!response.ok) throw badGateway();

    const { routes } = await response.json();
    if (!routes?.length) throw badGateway();
    const [route] = routes;
    return { durationSeconds: parseInt(route.duration, 10), distanceMeters: Number(route.distanceMeters) };
};

module.exports = { computeDrive };
