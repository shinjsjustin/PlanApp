import { act } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { GRAPH, renderMutations } from '../testUtils/mutationsHarness';

// The verbs the phone view adds: editing a sequence's description and a to-do's text.

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
        },
    };
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('updateSequenceDescription', () => {
    test.each([
        ['  Wings and lift  ', 'Wings and lift'],
        ['   ', null],
        ['', null],
    ])('patches %j as %j', async (input, expected) => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.sequences[0], description: expected });

        // Act
        await act(async () => {
            await result.current.updateSequenceDescription(100, input);
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/sequences/100', { description: expected });
        expect(stateOf().sequences[100].description).toBe(expected);
    });

    test('shows the description before the server answers', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockReturnValue(new Promise(() => {}));

        // Act
        await act(async () => {
            result.current.updateSequenceDescription(100, ' Draft ');
        });

        // Assert
        expect(stateOf().sequences[100].description).toBe('Draft');
    });

    test('puts the old description back when the request fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockRejectedValue(new ApiError('Save failed.', 500));

        // Act
        await act(async () => {
            await result.current.updateSequenceDescription(100, 'Draft');
        });

        // Assert
        expect(stateOf().sequences[100].description).toBe(null);
        expect(stateOf().actionError).toBe('Save failed.');
    });
});

describe('renameTodo', () => {
    test('patches the trimmed text', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.todos[1], text: 'Read about drag' });

        // Act
        await act(async () => {
            await result.current.renameTodo(1001, '  Read about drag ');
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/todos/1001', { text: 'Read about drag' });
        expect(stateOf().todos[1001].text).toBe('Read about drag');
    });

    test('shows the text before the server answers', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockReturnValue(new Promise(() => {}));

        // Act
        await act(async () => {
            result.current.renameTodo(1001, 'Renamed');
        });

        // Assert
        expect(stateOf().todos[1001].text).toBe('Renamed');
    });

    test('puts the old text back when the request fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockRejectedValue(new ApiError('Save failed.', 500));

        // Act
        await act(async () => {
            await result.current.renameTodo(1001, 'Renamed');
        });

        // Assert
        expect(stateOf().todos[1001].text).toBe('Read about lift');
        expect(stateOf().actionError).toBe('Save failed.');
    });

    test.each([[''], ['   ']])('sends nothing for blank text %j', async (blank) => {
        // Arrange
        const { result, stateOf } = await renderMutations();

        // Act
        await act(async () => {
            await result.current.renameTodo(1001, blank);
        });

        // Assert
        expect(api.patch).not.toHaveBeenCalled();
        expect(stateOf().todos[1001].text).toBe('Read about lift');
    });
});
