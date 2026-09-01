import React, { createContext, useContext } from 'react';

// Where the cards and dots put their DOM nodes so the canvas can measure them
// (spec section 4.6).
//
// Edges are drawn from real coordinates, and only the browser knows those. Each
// card and each connector dot hands its node up as it mounts; `useNodePositions`
// owns the map and reads every node at once, after layout.
//
// Kept apart from `ConnectContext` because the two change at completely
// different rates: these callbacks are created once and never again, while the
// connect selection changes on every click. A card re-rendering because someone
// armed a dot should not also re-register its node.

const NodeRegistryContext = createContext(null);

export const NodeRegistryProvider = ({ value, children }) => (
    <NodeRegistryContext.Provider value={value}>{children}</NodeRegistryContext.Provider>
);

/**
 * `{ registerDot, registerCard }`, each taking `(sequenceId, node)` and shaped
 * to be used from a React `ref` callback — React passes null on unmount, which
 * is how a node leaves the map.
 *
 * Null outside a provider, like the other canvas contexts: a card rendered on
 * its own in a test has nothing measuring it, and that is not a fault.
 */
export const useNodeRegistry = () => useContext(NodeRegistryContext);

export default NodeRegistryContext;
