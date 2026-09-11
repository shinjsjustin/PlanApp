import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import EdgeLayer from './EdgeLayer';
import LayerRow from './LayerRow';
import useConnectSelection from '../../hooks/useConnectSelection';
import useNodePositions from '../../hooks/useNodePositions';
import useProjectMutations from '../../hooks/useProjectMutations';
import { gutterXFor } from '../../lib/geometry';
import { activeSequenceId, isEligibleChild, sortByPosition } from '../../lib/graph';
import { ConnectProvider } from '../../state/ConnectContext';
import { NodeRegistryProvider } from '../../state/NodeRegistryContext';
import { clientKeyOf } from '../../state/projectReducer';
import { useProjectContext } from '../../state/ProjectContext';

// The layered graph. No pan, no zoom, and no scrolling of its own (spec 2): the
// canvas is as tall as its layers and the page is what scrolls, so there is one
// scrollbar for the whole project. Layers stack top to bottom by position, with
// the edges drawn behind them in a measured SVG overlay (spec section 4.6).
//
// Each row carries its own slice of the right-hand gutter for its add-sequence
// button, and its own full-width divider below it for adding a layer, so the
// only add-layer button that belongs here is the one for a project with no
// layers for it to sit under.
//
// This is where the three threads of connect mode are tied together, because it
// is the only place holding all of them: the selection, the layers the
// eligibility rule needs, and the mutation a click on a target performs. The
// cards themselves only ask "what am I right now" and say "I was clicked".
//
// It is also where the sequence *in operation* is picked. A card cannot work
// that out for itself — the answer depends on every other card and every edge
// between them — and the spotlight has to be exclusive, so exactly one card is
// told it is the active one and every other is told it is not.

/** What connect mode makes of one card. Null when nothing is armed at all. */
const CONNECT_STATE = {
    selected: 'selected',
    eligible: 'eligible',
    dimmed: 'dimmed',
};

const Canvas = ({ highlightedSequenceId = null }) => {
    const { state } = useProjectContext();
    const { addLayer, toggleEdge } = useProjectMutations();
    const { selectedIds, isConnecting, toggleParent, clear } = useConnectSelection();

    const canvasRef = useRef(null);

    // Each collection is derived once per change rather than once per render.
    // Everything below — the eligibility rule, the measured node map — is
    // memoised on these, and rebuilding them every time would defeat all of it.
    const layers = useMemo(() => sortByPosition(Object.values(state.layers)), [state.layers]);
    const sequences = useMemo(() => Object.values(state.sequences), [state.sequences]);
    const todos = useMemo(() => Object.values(state.todos), [state.todos]);
    const edges = useMemo(() => Object.values(state.edges), [state.edges]);

    // A card can appear or vanish without the canvas changing size — a sequence
    // added to a row that already had one, say — and the ResizeObserver would
    // not see that. This is what makes those re-measure too.
    const revision = sequences
        .map((sequence) => sequence.id)
        .sort()
        .join(',');

    const {
        nodes: measured,
        size,
        registerDot,
        registerCard,
    } = useNodePositions(canvasRef, revision);

    const registry = useMemo(() => ({ registerDot, registerCard }), [registerDot, registerCard]);

    /**
     * The one card that carries the spotlight, or null when there is nothing to
     * start. Recomputed with the graph rather than stored, like every other
     * derived value here, so ticking the last to-do of the active sequence hands
     * the ring straight to whatever became startable.
     */
    const activeId = useMemo(
        () => activeSequenceId({ sequences, todos, edges, layers }),
        [sequences, todos, edges, layers]
    );

    // Escape drops the selection wherever the focus happens to be, so connect
    // mode is never something the canvas gets stuck in.
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape') clear();
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [clear]);

    /**
     * A click on the canvas itself — not on anything laid out inside it — also
     * clears. Comparing against the canvas node is what makes that "empty
     * canvas" rather than "anywhere on the canvas", so a click meant for a card
     * or a button still reaches it.
     *
     * Bound to the node rather than written as an `onClick` prop because this is
     * a background gesture on a container, not a control: a div with a click
     * handler asks to be given a role and a key binding it should not have.
     */
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const onClick = (event) => {
            if (event.target === canvas) clear();
        };

        canvas.addEventListener('click', onClick);

        return () => canvas.removeEventListener('click', onClick);
    }, [clear]);

    const selectedParents = useMemo(
        () => [...selectedIds].map((id) => state.sequences[id]).filter(Boolean),
        [selectedIds, state.sequences]
    );

    /**
     * The gesture at the heart of connect mode: every armed parent is toggled
     * against the clicked child — tethered if it was not connected, untethered
     * if it was — and then the selection is dropped (spec decision 7).
     */
    const connectTo = useCallback(
        (sequence) => {
            selectedParents.forEach((parent) => toggleEdge(parent.id, sequence.id));
            clear();
        },
        [selectedParents, toggleEdge, clear]
    );

    const connect = useMemo(
        () => ({
            isConnecting,
            isSelected: (sequenceId) => selectedIds.has(sequenceId),
            stateOf: (sequence) => {
                if (!isConnecting) return null;
                if (selectedIds.has(sequence.id)) return CONNECT_STATE.selected;

                return isEligibleChild(sequence, selectedParents, layers)
                    ? CONNECT_STATE.eligible
                    : CONNECT_STATE.dimmed;
            },
            toggleParent,
            connectTo,
        }),
        [isConnecting, selectedIds, selectedParents, layers, toggleParent, connectTo]
    );

    /**
     * The measured coordinates, with each sequence's layer position folded in —
     * the shape `edgePaths` works from. Position comes from the graph rather
     * than from measurement because it is what decides the *kind* of edge, and
     * that must not change as things move around on screen.
     */
    const nodes = useMemo(
        () =>
            Object.entries(measured).reduce((byId, [sequenceId, position]) => {
                const layerId = state.sequences[sequenceId]?.layerId;
                const layer = layers.find((candidate) => candidate.id === layerId);

                if (!layer) return byId;

                return { ...byId, [sequenceId]: { ...position, layerPosition: layer.position } };
            }, {}),
        [measured, state.sequences, layers]
    );

    if (layers.length === 0) {
        return (
            <div className="canvas canvas--empty">
                <p>No layers yet.</p>
                <p>A layer is one band of parallel work — the first one starts the plan.</p>
                <button type="button" onClick={() => addLayer()}>
                    Add the first layer
                </button>
            </div>
        );
    }

    return (
        <ConnectProvider value={connect}>
            <NodeRegistryProvider value={registry}>
                <div
                    className={`canvas${isConnecting ? ' canvas--connecting' : ''}`}
                    ref={canvasRef}
                >
                    <EdgeLayer
                        edges={edges}
                        nodes={nodes}
                        gutterX={gutterXFor(size.width)}
                        size={size}
                    />

                    {layers.map((layer) => (
                        <LayerRow
                            key={clientKeyOf(layer)}
                            layer={layer}
                            sequences={sequences}
                            todos={todos}
                            activeSequenceId={activeId}
                            highlightedSequenceId={highlightedSequenceId}
                        />
                    ))}
                </div>
            </NodeRegistryProvider>
        </ConnectProvider>
    );
};

export default Canvas;
