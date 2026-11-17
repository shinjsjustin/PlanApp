import React, { useState } from 'react';

import useRhythm from '../../hooks/useRhythm';
import useIsPhone from '../../hooks/useIsPhone';
import { addWeeks, weekStart, zoneLabel } from '../../lib/rhythmWeek';
import AnchorEditor from './AnchorEditor';
import GateCard from './GateCard';
import RhythmWeekGrid from './RhythmWeekGrid';
import '../Styling/Rhythm.css';

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const RhythmPage = () => {
    const rhythm = useRhythm();
    const isPhone = useIsPhone();
    const [weekOffset, setWeekOffset] = useState(0);
    const [selectedAnchor, setSelectedAnchor] = useState(null);
    const [selectedGate, setSelectedGate] = useState(null);

    const zone = rhythm.timeZone || browserZone();
    const thisWeek = weekStart(new Date(), zone);
    const weekKey = addWeeks(thisWeek, weekOffset);

    const selectAnchor = (anchor) => {
        setSelectedGate(null);
        setSelectedAnchor(anchor);
    };
    const selectGate = (gate) => {
        setSelectedAnchor(null);
        setSelectedGate(gate);
    };
    const closeAnchor = () => setSelectedAnchor(null);

    if (rhythm.status === 'loading') return <p className="rhythm-page">Loading rhythm...</p>;

    if (rhythm.status === 'error') {
        return (
            <div className="rhythm-page">
                <p className="rhythm-error" role="alert">{rhythm.error}</p>
                <button type="button" className="rhythm-button" onClick={rhythm.reload}>Retry</button>
            </div>
        );
    }

    // Read the live copy so a saved edit shows at once.
    const liveAnchor = selectedAnchor && rhythm.anchors.find((a) => a.id === selectedAnchor.id);
    const isEmpty = rhythm.anchors.length === 0 && rhythm.gates.length === 0;

    return (
        <div className="rhythm-page">
            <header className="rhythm-header">
                <h1 className="rhythm-title">Rhythm</h1>
                <span className="rhythm-zone">{zoneLabel(rhythm.timeZone, browserZone())}</span>
                <div className="rhythm-week-nav">
                    <button type="button" className="rhythm-button" onClick={() => setWeekOffset((n) => n - 1)}>
                        Previous week
                    </button>
                    <span>{weekKey}</span>
                    <button type="button" className="rhythm-button" onClick={() => setWeekOffset((n) => n + 1)}>
                        Next week
                    </button>
                </div>
            </header>
            {isEmpty ? (
                <p className="rhythm-empty">No anchors or gates yet. Bourne adds them.</p>
            ) : (
                <div className="rhythm-body">
                    <RhythmWeekGrid
                        anchors={rhythm.anchors}
                        gates={rhythm.gates}
                        weekKey={weekKey}
                        timeZone={zone}
                        isPhone={isPhone}
                        onSelectAnchor={selectAnchor}
                        onSelectGate={selectGate}
                    />
                    {liveAnchor && !isPhone && (
                        <AnchorEditor
                            key={liveAnchor.id}
                            anchor={liveAnchor}
                            saveAnchor={rhythm.saveAnchor}
                            onClose={closeAnchor}
                        />
                    )}
                    {liveAnchor && isPhone && (
                        <aside className="rhythm-card" aria-label={`Anchor ${liveAnchor.title}`}>
                            <h3 className="rhythm-card-title">{liveAnchor.title}</h3>
                            <p>Time: {liveAnchor.time}</p>
                            <p>Days: {liveAnchor.days === 'daily' ? 'Every day' : liveAnchor.days.join(', ')}</p>
                            <p>{liveAnchor.enabled ? 'On' : 'Off'}</p>
                            <button type="button" className="rhythm-button" onClick={closeAnchor}>Close</button>
                        </aside>
                    )}
                    {selectedGate && (
                        <GateCard gate={selectedGate} timeZone={zone} onClose={() => setSelectedGate(null)} />
                    )}
                </div>
            )}
        </div>
    );
};

export default RhythmPage;
