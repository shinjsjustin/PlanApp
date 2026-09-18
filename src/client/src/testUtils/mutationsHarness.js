import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';

import { api } from '../lib/api';
import { PROJECT_STATUS } from '../state/projectReducer';
import { ProjectProvider } from '../state/ProjectContext';
import useProjectGraph from '../hooks/useProjectGraph';
import useProjectMutations from '../hooks/useProjectMutations';

// The fixture the mutation suites share.
//
// `useProjectMutations` has a verb per resource and the suites are split the
// same way, so the graph they all work from — and the harness that renders the
// verbs over a real `useProjectGraph` — lives here rather than four times over.
//
// Each suite still declares its own `jest.mock` of `lib/api`: the factory is
// hoisted into the file that owns it and cannot be shared from here.

export const GRAPH = {
    project: { id: 1, title: 'Build a drone', description: null, todoCount: 3, completedTodoCount: 0 },
    layers: [
        { id: 10, projectId: 1, title: 'Learning', position: 0 },
        { id: 20, projectId: 1, title: 'Design', position: 1 },
    ],
    sequences: [
        { id: 100, projectId: 1, layerId: 10, title: 'Learn aerodynamics', description: null, isBlocked: false, position: 0 },
        { id: 101, projectId: 1, layerId: 10, title: 'Learn electronics', description: null, isBlocked: false, position: 1 },
        { id: 200, projectId: 1, layerId: 20, title: 'Design rotor system', description: null, isBlocked: false, position: 0 },
    ],
    todos: [
        { id: 1000, projectId: 1, sequenceId: null, text: 'Loose', status: 'incomplete', position: 0 },
        { id: 1001, projectId: 1, sequenceId: 100, text: 'Read about lift', status: 'incomplete', position: 0 },
    ],
};

/**
 * Renders the verbs over a real `useProjectGraph`, so each test asserts both the
 * request that went out and the graph the canvas is left showing — rather than
 * that one function called another.
 */
export const renderMutations = async () => {
    api.get.mockResolvedValue(GRAPH);

    let graph;
    const wrapper = ({ children }) => {
        graph = useProjectGraph(1);

        return <ProjectProvider value={graph}>{children}</ProjectProvider>;
    };

    const rendered = renderHook(() => useProjectMutations(), { wrapper });
    await waitFor(() => expect(graph.state.status).toBe(PROJECT_STATUS.ready));

    return { ...rendered, stateOf: () => graph.state };
};

export const positionsIn = (collection, predicate = () => true) =>
    Object.values(collection)
        .filter(predicate)
        .map((entity) => [entity.id, entity.position])
        .sort((a, b) => a[1] - b[1]);
