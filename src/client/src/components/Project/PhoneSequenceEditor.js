import React from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';
import InlineTitle from './InlineTitle';
import PhoneSequenceDescription from './PhoneSequenceDescription';
import PlaceSelect from '../Places/PlaceSelect';

const PhoneSequenceEditor = ({ sequence, onDone }) => {
    const { renameSequence, setSequenceBlocked, setSequencePlace } = useProjectMutations();

    return (
        <div className="phone-sequence-editor">
            <InlineTitle
                value={sequence.title}
                label="Sequence title"
                flushOnUnmount
                onSave={(title) => renameSequence(sequence.id, title)}
            />
            <PhoneSequenceDescription sequence={sequence} />
            <PlaceSelect
                value={sequence.placeId}
                onChange={(placeId) => setSequencePlace(sequence.id, placeId)}
            />
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
