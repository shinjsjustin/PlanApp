import React from 'react';
import { act, renderHook } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { ProjectProvider } from '../state/ProjectContext';
import { GRAPH, renderMutations } from '../testUtils/mutationsHarness';
import useProjectGraph from './useProjectGraph';
import useProjectMutations from './useProjectMutations';

// The import verbs of `useProjectMutations`.

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

const SCHEMA = '## New layer\n### New sequence\n- A todo';
const NEW_LAYER = { id: 30, projectId: 1, title: 'New layer', position: 1 };
const IMPORTED_GRAPH = { ...GRAPH, layers: [GRAPH.layers[0], NEW_LAYER, GRAPH.layers[1]] };

describe('importLayer', () => {
    test('posts the schema and anchor, then shows the re-read graph without loading', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        const statusesDuringRead = [];
        api.post.mockResolvedValue({ layers: 1 });
        api.get.mockImplementationOnce(async () => {
            statusesDuringRead.push(stateOf().status);
            return IMPORTED_GRAPH;
        });

        // Act
        let returned;
        await act(async () => {
            returned = await result.current.importLayer(SCHEMA, 10);
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects/1/layers/import', {
            schema: SCHEMA,
            afterLayerId: 10,
        });
        expect(returned).toEqual({ layers: 1 });
        expect(statusesDuringRead).toEqual(['ready']);
        expect(stateOf().status).toBe('ready');
        expect(Object.keys(stateOf().layers).sort()).toEqual(['10', '20', '30']);
    });

    test('omits afterLayerId when appending', async () => {
        // Arrange
        const { result } = await renderMutations();
        api.post.mockResolvedValue({});

        // Act
        await act(async () => {
            await result.current.importLayer(SCHEMA);
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects/1/layers/import', { schema: SCHEMA });
    });

    test('rejects with the ApiError and leaves the graph alone when the request fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        const failure = new ApiError('Line 2 is invalid.', 400);
        api.post.mockRejectedValue(failure);
        const before = stateOf();
        api.get.mockClear();

        // Act + Assert
        await act(async () => {
            await expect(result.current.importLayer(SCHEMA, 10)).rejects.toBe(failure);
        });
        expect(api.get).not.toHaveBeenCalled();
        expect(stateOf()).toBe(before);
    });
});

describe('importSequences', () => {
    test('posts the schema to the layer and shows the re-read graph without loading', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        const statusesDuringRead = [];
        const newSequence = { ...GRAPH.sequences[0], id: 300, layerId: 20, position: 1 };
        api.post.mockResolvedValue({ sequences: 1 });
        api.get.mockImplementationOnce(async () => {
            statusesDuringRead.push(stateOf().status);
            return { ...GRAPH, sequences: [...GRAPH.sequences, newSequence] };
        });

        // Act
        await act(async () => {
            await result.current.importSequences(20, SCHEMA);
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/layers/20/sequences/import', { schema: SCHEMA });
        expect(statusesDuringRead).toEqual(['ready']);
        expect(stateOf().sequences[300]).toMatchObject({ layerId: 20 });
    });

    test('rejects with the ApiError and leaves the graph alone when the request fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        const failure = new ApiError('Bad schema.', 400);
        api.post.mockRejectedValue(failure);
        const before = stateOf();

        // Act + Assert
        await act(async () => {
            await expect(result.current.importSequences(20, SCHEMA)).rejects.toBe(failure);
        });
        expect(stateOf()).toBe(before);
    });
});

describe('when the graph is not ready', () => {
    test('both verbs reject without sending a request', async () => {
        // Arrange — the first read never settles, so the status stays loading.
        api.get.mockReturnValue(new Promise(() => {}));
        const wrapper = ({ children }) => (
            <ProjectProvider value={useProjectGraph(1)}>{children}</ProjectProvider>
        );
        const { result } = renderHook(() => useProjectMutations(), { wrapper });

        // Act + Assert
        await expect(result.current.importLayer(SCHEMA, 10)).rejects.toThrow(Error);
        await expect(result.current.importSequences(20, SCHEMA)).rejects.toThrow(Error);
        expect(api.post).not.toHaveBeenCalled();
    });
});
