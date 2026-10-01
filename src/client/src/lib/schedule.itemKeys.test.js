import { itemKeyOf, refOfKey, sequenceKeyOf, todoKeyOf } from './schedule';

describe('item key format', () => {
    it('builds the key of each kind', () => {
        expect(todoKeyOf(7)).toBe('todo:7');
        expect(sequenceKeyOf(4)).toBe('sequence:4');
    });

    it('builds itemKeyOf from the same keys', () => {
        expect(itemKeyOf({ todoId: 7 })).toBe('todo:7');
        expect(itemKeyOf({ kind: 'sequence', todoId: null, sequenceId: 4 })).toBe('sequence:4');
    });

    it('turns a sequence key back into a sequence ref with a numeric id', () => {
        expect(refOfKey('sequence:4')).toEqual({ kind: 'sequence', sequenceId: 4 });
    });

    it('turns a todo key back into a todo ref with a numeric id', () => {
        expect(refOfKey('todo:7')).toEqual({ todoId: 7 });
    });

    it('round-trips both kinds', () => {
        expect(refOfKey(todoKeyOf(12))).toEqual({ todoId: 12 });
        expect(refOfKey(sequenceKeyOf(12))).toEqual({ kind: 'sequence', sequenceId: 12 });
    });

    it.each(['7', 'task:7', 'todo:', 'todo:x', 'sequence:1.5', ''])(
        'throws on %j, which is not a key',
        (value) => {
            expect(() => refOfKey(value)).toThrow();
        }
    );
});
