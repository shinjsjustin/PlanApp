'use strict';

const requiredEnv = require('../../src/lib/requiredEnv');

/**
 * The guard behind spec section 5's rule that nothing is configured by accident.
 * A secret with a default is a secret everybody knows, so the only two answers
 * here are the configured value or a refusal that names what is missing.
 */

const NAME = 'PLANAPP_TEST_ONLY_VAR';

afterEach(() => {
    delete process.env[NAME];
});

describe('requiredEnv', () => {
    test('returns the value when the variable is set', () => {
        // Arrange
        process.env[NAME] = 'a-configured-secret';

        // Act
        const value = requiredEnv(NAME);

        // Assert
        expect(value).toBe('a-configured-secret');
    });

    test('throws naming the variable when it is missing', () => {
        // Act + Assert — naming it is the point: an unnamed "misconfigured"
        // leaves the reader guessing which of a dozen variables it meant.
        expect(() => requiredEnv(NAME)).toThrow(NAME);
    });

    test('throws when the variable is set to whitespace', () => {
        // Arrange — an empty assignment in a .env file reads as "set" to Node.
        process.env[NAME] = '   ';

        // Act + Assert
        expect(() => requiredEnv(NAME)).toThrow(NAME);
    });
});
