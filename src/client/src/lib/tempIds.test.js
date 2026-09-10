import { createTempId, isTempId } from './tempIds';

describe('tempIds', () => {
    test('hands out a fresh negative id each time', () => {
        // Arrange + Act
        const first = createTempId();
        const second = createTempId();

        // Assert
        expect(first).toBeLessThan(0);
        expect(second).toBeLessThan(first);
    });

    test('recognises its own ids and rejects server ids', () => {
        // Arrange + Act + Assert
        expect(isTempId(createTempId())).toBe(true);
        expect(isTempId(1)).toBe(false);
        expect(isTempId(999999)).toBe(false);
    });
});
