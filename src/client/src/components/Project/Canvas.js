import React, { useMemo, useState } from 'react';

import ContextMenu from '../common/ContextMenu';
import ImportDialog from './ImportDialog';
import LayerRow from './LayerRow';
import useContextMenu from '../../hooks/useContextMenu';
import useProjectMutations from '../../hooks/useProjectMutations';
import { sortByPosition } from '../../lib/graph';
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

const IMPORT_HINT =
    'Paste a plan: "## layer" starts a layer, "### sequence" starts a sequence, ' +
    'and "- todo" adds a to-do. To-dos before the first ### go to Unorganized.';

const Canvas = ({ highlightedSequenceId = null }) => {
    const { state } = useProjectContext();
    const { addLayer, importLayer } = useProjectMutations();
    const [isImporting, setIsImporting] = useState(false);
    const { menu, close, triggerProps } = useContextMenu();

    // Each collection is derived once per change rather than once per render.
    const layers = useMemo(() => sortByPosition(Object.values(state.layers)), [state.layers]);
    const sequences = useMemo(() => Object.values(state.sequences), [state.sequences]);
    const todos = useMemo(() => Object.values(state.todos), [state.todos]);

    if (layers.length === 0) {
        return (
            <div className="canvas canvas--empty">
                <p>No layers yet.</p>
                <p>A layer is one band of parallel work — the first one starts the plan.</p>
                <button type="button" onClick={() => addLayer()} {...triggerProps}>
                    Add the first layer
                </button>
                {menu && (
                    <ContextMenu
                        x={menu.x}
                        y={menu.y}
                        label="Layer actions"
                        items={[{ label: 'Import layer…', onSelect: () => setIsImporting(true) }]}
                        onClose={close}
                    />
                )}
                {isImporting && (
                    <ImportDialog
                        title="Import layer"
                        hint={IMPORT_HINT}
                        onImport={(text) => importLayer(text)}
                        onClose={() => setIsImporting(false)}
                    />
                )}
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
                    highlightedSequenceId={highlightedSequenceId}
                />
            ))}
        </div>
    );
};

export default Canvas;
