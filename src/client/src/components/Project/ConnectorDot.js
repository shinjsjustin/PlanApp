import React from 'react';

import { useConnectMode } from '../../state/ConnectContext';
import { useNodeRegistry } from '../../state/NodeRegistryContext';

// The handle under a sequence card that starts a connection (spec section 4.7).
//
// Clicking it arms this sequence as a parent and fills the dot in; clicking it
// again disarms it. Several can be armed at once, which is how two sequences
// come to feed the same child in one gesture.
//
// It is also one of the two things edges are measured from: the dot is where an
// outgoing edge leaves, and the card's top edge is where an incoming one lands.
// Registering the node is all this component does about that — it has no idea
// what is eventually drawn from it.
//
// A real `<button>` rather than a styled div, so it is reachable by keyboard and
// announces its own state through `aria-pressed`.

const ConnectorDot = ({ sequence }) => {
    const connect = useConnectMode();
    const registry = useNodeRegistry();

    const isSelected = connect?.isSelected(sequence.id) ?? false;

    return (
        <button
            type="button"
            ref={(node) => registry?.registerDot(sequence.id, node)}
            className={`connector-dot${isSelected ? ' connector-dot--selected' : ''}`}
            aria-pressed={isSelected}
            aria-label={`Connect from ${sequence.title}`}
            title={`Connect from ${sequence.title}`}
            onClick={() => connect?.toggleParent(sequence.id)}
        />
    );
};

export default ConnectorDot;
