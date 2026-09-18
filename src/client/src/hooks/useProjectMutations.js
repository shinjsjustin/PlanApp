import { useCallback, useMemo } from 'react';

import { sortByPosition } from '../lib/graph';
import {
    cascadeLayerRemoval,
    cascadeSequenceMove,
    cascadeSequenceRemoval,
    cascadeTodoMove,
    cascadeTodoRemoval,
    shiftLayersForInsert,
} from '../state/cascades';
import { useProjectContext } from '../state/ProjectContext';

// The canvas buttons, as verbs (spec sections 4.4 and 4.7).
//
// `useProjectGraph` speaks in collections and paths; the buttons speak in layers
// and sequences. This is the one place that maps between them, so a route, an
// optimistic row's default fields, and the fallout of a delete are each written
// down once instead of once per button.
//
// Every verb goes through the optimistic path, so each change is on screen
// before the request goes out and is rolled back if it fails.

const DEFAULT_LAYER_TITLE = 'Untitled layer';
const DEFAULT_SEQUENCE_TITLE = 'Untitled sequence';
const DEFAULT_TODO_STATUS = 'incomplete';

/**
 * The to-dos in one list. `sequenceId` of null is the unorganized panel, which
 * is a filter over the project's to-dos rather than a collection of its own —
 * so both lists are counted the same way.
 */
const todosIn = (state, sequenceId) =>
    Object.values(state.todos).filter((todo) => todo.sequenceId === sequenceId);

const useProjectMutations = () => {
    const { state, createEntity, updateEntity, removeEntity } = useProjectContext();

    const projectId = state.project?.id;

    /**
     * Where a new layer goes: after the named one, or at the end. A layer id
     * that is not in the graph throws rather than falling back to appending —
     * putting the layer somewhere the user did not point at would be worse than
     * refusing.
     */
    const insertIndexFor = useCallback(
        (afterLayerId) => {
            const layers = sortByPosition(Object.values(state.layers));

            if (afterLayerId === null || afterLayerId === undefined) return layers.length;

            const index = layers.findIndex((layer) => layer.id === afterLayerId);
            if (index === -1) {
                throw new Error(`Layer ${afterLayerId} is not in this project`);
            }

            return index + 1;
        },
        [state.layers]
    );

    const addLayer = useCallback(
        async (afterLayerId = null) => {
            const index = insertIndexFor(afterLayerId);

            return createEntity('layers', {
                path: `/projects/${projectId}/layers`,
                optimistic: { projectId, title: DEFAULT_LAYER_TITLE, position: index },
                body: afterLayerId === null ? {} : { afterLayerId },
                also: shiftLayersForInsert(state, index),
            });
        },
        [createEntity, insertIndexFor, projectId, state]
    );

    const renameLayer = useCallback(
        (layerId, title) =>
            updateEntity('layers', layerId, { path: `/layers/${layerId}`, changes: { title } }),
        [updateEntity]
    );

    const deleteLayer = useCallback(
        (layerId) =>
            removeEntity('layers', layerId, {
                path: `/layers/${layerId}`,
                also: cascadeLayerRemoval(state, layerId),
            }),
        [removeEntity, state]
    );

    const addSequence = useCallback(
        (layerId) => {
            const position = Object.values(state.sequences).filter(
                (sequence) => sequence.layerId === layerId
            ).length;

            return createEntity('sequences', {
                path: `/layers/${layerId}/sequences`,
                optimistic: {
                    projectId,
                    layerId,
                    title: DEFAULT_SEQUENCE_TITLE,
                    description: null,
                    isBlocked: false,
                    position,
                },
                // The endpoint takes no input: the sequence it creates is
                // untitled and goes at the end of the layer.
                body: {},
            });
        },
        [createEntity, projectId, state.sequences]
    );

    const renameSequence = useCallback(
        (sequenceId, title) =>
            updateEntity('sequences', sequenceId, {
                path: `/sequences/${sequenceId}`,
                changes: { title },
            }),
        [updateEntity]
    );

    const setSequenceBlocked = useCallback(
        (sequenceId, isBlocked) =>
            updateEntity('sequences', sequenceId, {
                path: `/sequences/${sequenceId}`,
                changes: { isBlocked },
            }),
        [updateEntity]
    );

    // Folding a card shut is remembered per sequence rather than per session, so
    // a canvas comes back the way it was left. It travels the same optimistic
    // path as every other patch: the card folds on the click and the request
    // catches up, because a chevron that waited on the network would feel broken.
    const setSequenceCollapsed = useCallback(
        (sequenceId, isCollapsed) =>
            updateEntity('sequences', sequenceId, {
                path: `/sequences/${sequenceId}`,
                changes: { isCollapsed },
            }),
        [updateEntity]
    );

    const deleteSequence = useCallback(
        (sequenceId) =>
            removeEntity('sequences', sequenceId, {
                path: `/sequences/${sequenceId}`,
                also: cascadeSequenceRemoval(state, sequenceId),
            }),
        [removeEntity, state]
    );

    /**
     * Puts a sequence at a position in a layer — the verb behind dragging a card
     * from one band to another (spec section 9 of the 2026-09-07 changes).
     *
     * The layer it left closes up and the one it joins opens a slot, which is
     * the same reindexing the server does inside its transaction.
     */
    const moveSequence = useCallback(
        (sequenceId, placement) =>
            updateEntity('sequences', sequenceId, {
                path: `/sequences/${sequenceId}/move`,
                method: 'put',
                changes: placement,
                body: placement,
                also: cascadeSequenceMove(state, sequenceId, placement),
            }),
        [updateEntity, state]
    );

    const addTodo = useCallback(
        (text, sequenceId = null) =>
            createEntity('todos', {
                path: `/projects/${projectId}/todos`,
                optimistic: {
                    projectId,
                    sequenceId,
                    text,
                    status: DEFAULT_TODO_STATUS,
                    position: todosIn(state, sequenceId).length,
                },
                body: { text, sequenceId },
            }),
        [createEntity, projectId, state]
    );

    // Ticking a to-do changes nothing else: a sequence's status is derived from
    // its to-dos on every render, so there is no stored status to update here
    // (spec section 4.3).
    const setTodoStatus = useCallback(
        (todoId, status) =>
            updateEntity('todos', todoId, { path: `/todos/${todoId}`, changes: { status } }),
        [updateEntity]
    );

    /**
     * Puts a to-do at a position in a list — the verb behind every drop, and
     * behind the menu action below (spec section 4.7).
     *
     * Both cases of the endpoint come through here. Changing lists closes the
     * old one up and opens a slot in the new one; staying in the same list
     * shifts only the to-dos passed over. That is the same reindexing the server
     * does inside its transaction, so a successful move changes nothing further
     * and a failed one is rolled back whole.
     */
    const moveTodo = useCallback(
        (todoId, placement) =>
            updateEntity('todos', todoId, {
                path: `/todos/${todoId}/move`,
                method: 'put',
                changes: placement,
                body: placement,
                also: cascadeTodoMove(state, todoId, placement),
            }),
        [updateEntity, state]
    );

    // How a to-do leaves a sequence in v1 — a menu action, deliberately not a
    // drag (spec section 4.7). It lands at the end of the unorganized panel.
    const moveTodoToUnorganized = useCallback(
        (todoId) =>
            moveTodo(todoId, { sequenceId: null, position: todosIn(state, null).length }),
        [moveTodo, state]
    );

    const deleteTodo = useCallback(
        (todoId) =>
            removeEntity('todos', todoId, {
                path: `/todos/${todoId}`,
                also: cascadeTodoRemoval(state, todoId),
            }),
        [removeEntity, state]
    );

    return useMemo(
        () => ({
            addLayer,
            renameLayer,
            deleteLayer,
            addSequence,
            renameSequence,
            setSequenceBlocked,
            setSequenceCollapsed,
            deleteSequence,
            moveSequence,
            addTodo,
            setTodoStatus,
            moveTodo,
            moveTodoToUnorganized,
            deleteTodo,
        }),
        [
            addLayer,
            renameLayer,
            deleteLayer,
            addSequence,
            renameSequence,
            setSequenceBlocked,
            setSequenceCollapsed,
            deleteSequence,
            moveSequence,
            addTodo,
            setTodoStatus,
            moveTodo,
            moveTodoToUnorganized,
            deleteTodo,
        ]
    );
};

export default useProjectMutations;
