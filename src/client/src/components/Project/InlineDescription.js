import React, { useEffect, useRef, useState } from 'react';

import useDebouncedCallback from '../../hooks/useDebouncedCallback';
import useProjectMutations from '../../hooks/useProjectMutations';

// Matches DESCRIPTION_MAX_LENGTH in src/lib/validation.js. CRA cannot import
// server modules outside src/client/src; normalization stays at the API boundary.
const DESCRIPTION_MAX_LENGTH = 2000;
export const SAVE_DELAY_MS = 400;

const InlineDescription = ({ value }) => {
    const { updateProjectDescription } = useProjectMutations();
    // null means follow the graph, including optimistic updates and rollback.
    const [draft, setDraft] = useState(null);
    const hasEditRef = useRef(false);
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);
    const { run: save, cancel } = useDebouncedCallback((description) => {
        if (isMountedRef.current) setDraft(null);
        updateProjectDescription(description);
    }, SAVE_DELAY_MS, { shouldFlushOnUnmount: true });

    const commit = () => {
        if (!hasEditRef.current) return;
        hasEditRef.current = false;
        if (draft === (value ?? '')) {
            cancel();
            setDraft(null);
            return;
        }
        save(draft);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
            hasEditRef.current = false;
            setDraft(null);
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
        }
    };

    return (
        <textarea
            className="inline-description"
            aria-label="Project description"
            placeholder="What problem are you trying to solve?"
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={3}
            value={draft ?? value ?? ''}
            onChange={(event) => {
                cancel();
                hasEditRef.current = true;
                setDraft(event.target.value);
            }}
            onBlur={commit}
            onKeyDown={handleKeyDown}
        />
    );
};

export default InlineDescription;
