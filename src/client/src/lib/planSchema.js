import { sortByPosition } from './graph';

const NEWLINES = /\r?\n|\r/g;

const oneLine = (text) => text.replace(NEWLINES, ' ').replace(/ {2,}/g, ' ');

/** The plan schema text for one layer; the server parser reads it back unchanged. */
export const layerToSchema = (layer, sequences, todos) => {
    const blocks = sortByPosition(sequences.filter((sequence) => sequence.layerId === layer.id)).map(
        (sequence) => {
            const lines = sortByPosition(todos.filter((todo) => todo.sequenceId === sequence.id)).map(
                (todo) => `- ${oneLine(todo.text)}`
            );
            return ['', `### ${oneLine(sequence.title)}`, ...lines];
        }
    );
    return [`## ${oneLine(layer.title)}`, ...blocks.flat()].join('\n') + '\n';
};
