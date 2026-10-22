import React from 'react';

const WalkNav = ({ cardName, keys, selectedKey, onPrevious, onNext, onNextUnfilled }) => {
    const idx = keys.indexOf(selectedKey);
    return (
        <div className="walk-nav">
            <button type="button" onClick={onPrevious}>Previous</button>
            <button type="button" onClick={onNext}>Next</button>
            <button type="button" className="primary" onClick={onNextUnfilled}>Next unfilled</button>
            <span className="pos hint">{cardName}: {idx >= 0 ? idx + 1 : '–'} of {keys.length}</span>
        </div>
    );
};

export default WalkNav;
