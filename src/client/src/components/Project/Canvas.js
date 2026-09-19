import React, { useMemo } from 'react';

import LayerRow from './LayerRow';
import useProjectMutations from '../../hooks/useProjectMutations';
import { activeSequenceIds, sortByPosition } from '../../lib/graph';
import { clientKeyOf } from '../../state/projectReducer';
import { useProjectContext } from '../../state/ProjectContext';

// The layered graph. No pan, no zoom, and no scrolling of its own (spec 2): the
// canvas is as tall as its layers and the page is what scrolls, so there is one
// scrollbar for the whole project. Layers stack top to bottom by position.
//
// Each row carries its own slice of the right-hand gutter for its add-sequence
// button, and its own full-width divider below it for adding a layer, so the
// only add-layer button that belongs here is the one for a project with no
// layers for it to sit under.
//
// It is also where pin activity is derived. A card cannot work that out from its
// own props alone, so the canvas computes the Set once and every row asks it the
// same question. Any number of sequences may be active at once.

const Canvas = ({ highlightedSequenceId = null }) => {
    const { state } = useProjectContext();
    const { addLayer } = useProjectMutations();

    // Each collection is derived once per change rather than once per render,
    // because the active sequence Set is memoised on them and rebuilding them every
    // time would defeat that.
    const layers = useMemo(() => sortByPosition(Object.values(state.layers)), [state.layers]);
    const sequences = useMemo(() => Object.values(state.sequences), [state.sequences]);
    const todos = useMemo(() => Object.values(state.todos), [state.todos]);

    /**
     * Every card containing a pin. Recomputed with the graph rather than stored,
     * so pinning and unpinning update all cards without lifecycle or layer-order
     * rules leaking into activity.
     */
    const activeIds = useMemo(() => activeSequenceIds(sequences, todos), [sequences, todos]);

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
        <div className="canvas">
            {layers.map((layer) => (
                <LayerRow
                    key={clientKeyOf(layer)}
                    layer={layer}
                    sequences={sequences}
                    todos={todos}
                    activeSequenceIds={activeIds}
                    highlightedSequenceId={highlightedSequenceId}
                />
            ))}
        </div>
    );
};

export default Canvas;
