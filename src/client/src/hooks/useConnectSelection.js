import { useCallback, useMemo, useState } from 'react';

// Which sequences are armed as parents (spec section 4.7).
//
// A set rather than a single id, because several parents can be connected to one
// child in a single gesture: aerodynamics and electronics both feed the rotor
// design, and arming both means one click on the rotor tethers both (spec
// section 1). The same set is what lets several parents be untethered at once.
//
// This holds the selection and nothing else. Which cards that makes eligible is
// `isEligibleChild` in `lib/graph`, and what happens when one is clicked belongs
// to the canvas that owns the mutations. Keeping those out means this hook needs
// no graph, no provider and no DOM to test.

const useConnectSelection = () => {
    const [selectedIds, setSelectedIds] = useState(() => new Set());

    // Every change builds a new set. React compares by identity, so writing into
    // the existing one would leave the cards reading it unaware anything moved.
    const toggleParent = useCallback((sequenceId) => {
        setSelectedIds((current) => {
            const next = new Set(current);

            if (!next.delete(sequenceId)) next.add(sequenceId);

            return next;
        });
    }, []);

    /**
     * Drops the whole selection — Escape, a click on empty canvas, or a finished
     * connection.
     *
     * An already empty selection keeps the set it has rather than swapping in an
     * identical one, so the clicks on empty canvas that arrive when nothing is
     * armed cost nothing downstream.
     */
    const clear = useCallback(() => {
        setSelectedIds((current) => (current.size === 0 ? current : new Set()));
    }, []);

    return useMemo(
        () => ({
            selectedIds,
            isConnecting: selectedIds.size > 0,
            toggleParent,
            clear,
        }),
        [selectedIds, toggleParent, clear]
    );
};

export default useConnectSelection;
