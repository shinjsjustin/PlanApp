'use strict';

const { computeDrive } = require('../../src/lib/google/routesApi');
const { HttpError } = require('../../src/lib/httpError');

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const TRIP = {
    originAddress: '1 A St',
    destinationAddress: '2 B Ave',
    departureTime: '2026-03-01T09:00:00.000Z',
};

let fetchMock;
beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const expectBadGateway = async (promise) => {
    const error = await promise.catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(502);
    expect(error.message).toBe('Google Maps request failed');
};

describe('computeDrive', () => {
    it('POSTs the drive request with key, field mask and body', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, { routes: [{ duration: '1234s', distanceMeters: 5600 }] })
        );

        const result = await computeDrive('key-1', TRIP);

        expect(result).toEqual({ durationSeconds: 1234, distanceMeters: 5600 });
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
        expect(options.method).toBe('POST');
        expect(options.headers).toEqual({
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': 'key-1',
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        });
        expect(JSON.parse(options.body)).toEqual({
            origin: { address: '1 A St' },
            destination: { address: '2 B Ave' },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
            departureTime: TRIP.departureTime,
        });
    });

    it('throws 502 on a non-OK status', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
        await expectBadGateway(computeDrive('k', TRIP));
    });

    it('throws 502 when fetch rejects', async () => {
        fetchMock.mockRejectedValueOnce(new Error('network down'));
        await expectBadGateway(computeDrive('k', TRIP));
    });

    it('throws 502 when there are no routes', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
        await expectBadGateway(computeDrive('k', TRIP));
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { routes: [] }));
        await expectBadGateway(computeDrive('k', TRIP));
    });
});
