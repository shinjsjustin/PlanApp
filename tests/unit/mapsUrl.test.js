'use strict';

const travelTime = require('../../src/lib/travelTime');

describe('mapsUrlFor', () => {
    it('builds an encoded driving directions link', () => {
        expect(typeof travelTime.mapsUrlFor).toBe('function');
        expect(travelTime.mapsUrlFor('1 A St, X', 'B & C')).toBe(
            'https://www.google.com/maps/dir/?api=1&origin=1%20A%20St%2C%20X&destination=B%20%26%20C&travelmode=driving'
        );
    });
});
