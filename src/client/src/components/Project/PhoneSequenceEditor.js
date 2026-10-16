import React from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';
import InlineTitle from './InlineTitle';
import PhoneSequenceDescription from './PhoneSequenceDescription';

const PhoneSequenceEditor = ({ sequence, onDone }) => {
    const { renameSequence, setSequenceBlocked } = useProjectMutations();

    return (
        <div className="phone-sequence-editor">
            <InlineTitle
                value={sequence.title}
                label="Sequence title"
                flushOnUnmount
                onSave={(title) => renameSequence(sequence.id, title)}
            />
            <PhoneSequenceDescription sequence={sequence} />
            <button
                type="button"
                className="phone-sequence-blocked-toggle"
                aria-pressed={sequence.isBlocked}
                onClick={() => setSequenceBlocked(sequence.id, !sequence.isBlocked)}
            >
                Blocked
            </button>
            <button type="button" className="phone-sequence-done" onClick={onDone}>
                Done
            </button>
        </div>
    );
};

export default PhoneSequenceEditor;
