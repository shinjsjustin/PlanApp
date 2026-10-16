import React, { useEffect, useRef, useState } from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';

// Matches DESCRIPTION_MAX_LENGTH for sequences on the server; CRA cannot import
// server modules, so normalization stays at the API boundary.
const DESCRIPTION_MAX_LENGTH = 2000;

const PhoneSequenceDescription = ({ sequence }) => {
    const { updateSequenceDescription } = useProjectMutations();
    // null means follow the graph, including optimistic updates and rollback.
    const [draft, setDraft] = useState(null);
    const draftRef = useRef(null);
    const hasEditRef = useRef(false);
    // The unmount cleanup must see the latest save function, not the first render's.
    const saveRef = useRef(null);
    saveRef.current = (description) => updateSequenceDescription(sequence.id, description);

    const commit = () => {
        if (!hasEditRef.current) return;
        hasEditRef.current = false;
        if (draftRef.current !== (sequence.description ?? '')) saveRef.current(draftRef.current);
        setDraft(null);
    };

    useEffect(() => () => {
        if (hasEditRef.current) saveRef.current(draftRef.current);
    }, []);

    const handleKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        hasEditRef.current = false;
        setDraft(null);
    };

    return (
        <textarea
            className="phone-sequence-description-input"
            aria-label="Sequence description"
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={3}
            value={draft ?? sequence.description ?? ''}
            onChange={(event) => {
                hasEditRef.current = true;
                draftRef.current = event.target.value;
                setDraft(event.target.value);
            }}
            onBlur={commit}
            onKeyDown={handleKeyDown}
        />
    );
};

export default PhoneSequenceDescription;
