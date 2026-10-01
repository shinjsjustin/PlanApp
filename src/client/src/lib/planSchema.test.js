import cases from '../../../shared/planSchemaCases.json';

import { layerToSchema } from './planSchema';

const STATUSES = ['complete', 'incomplete', 'blocked'];

/** Graph-shaped rows, deliberately stored out of position order with mixed status. */
const buildGraph = (layerCase) => {
    const layer = { id: 1, title: layerCase.layer.title };
    const sequences = [];
    const todos = [];
    let todoId = 100;
    layerCase.sequences.forEach((seq, index) => {
        const id = 10 + index;
        sequences.push({ id, layerId: layer.id, title: seq.title, position: index });
        seq.todos.forEach((text, position) => {
            todos.push({
                id: todoId++,
                sequenceId: id,
                text,
                position,
                status: STATUSES[position % STATUSES.length],
            });
        });
    });
    return { layer, sequences: sequences.reverse(), todos: todos.reverse() };
};

describe('layerToSchema', () => {
    test.each(cases.map((c) => [c.name, c]))('matches the shared schema for %s', (_name, c) => {
        const { layer, sequences, todos } = buildGraph(c);
        expect(layerToSchema(layer, sequences, todos)).toBe(c.schema);
    });

    test('leaves out other layers and unorganized todos', () => {
        const layer = { id: 1, title: 'A' };
        const sequences = [
            { id: 10, layerId: 1, title: 'Mine', position: 0 },
            { id: 20, layerId: 2, title: 'Theirs', position: 0 },
        ];
        const todos = [
            { id: 1, sequenceId: 10, text: 'in', position: 0 },
            { id: 2, sequenceId: 20, text: 'other layer', position: 0 },
            { id: 3, sequenceId: null, text: 'unorganized', position: 0 },
        ];
        expect(layerToSchema(layer, sequences, todos)).toBe('## A\n\n### Mine\n- in\n');
    });

    test('turns newlines in titles and text into single spaces', () => {
        const layer = { id: 1, title: 'Two\nlines' };
        const sequences = [{ id: 10, layerId: 1, title: 'Seq\r\none', position: 0 }];
        const todos = [{ id: 1, sequenceId: 10, text: 'a\n\nb', position: 0 }];
        expect(layerToSchema(layer, sequences, todos)).toBe('## Two lines\n\n### Seq one\n- a b\n');
    });
});
