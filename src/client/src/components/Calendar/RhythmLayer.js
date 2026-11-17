import React from 'react';

import { useDayGeometry } from '../../state/DayScaleContext';
import { useRhythmMarkers } from '../../state/RhythmContext';
import '../Styling/Rhythm.css';

// Passive, read-only: anchors and gate closes drawn as thin rules with a label.
const RhythmLayer = ({ date }) => {
    const markers = useRhythmMarkers(date);
    const geometry = useDayGeometry();

    if (markers.length === 0) return null;

    return (
        <div className="rhythm-layer" aria-hidden="true">
            {markers.map((marker) => (
                <div
                    key={marker.key}
                    className={`rhythm-marker rhythm-marker-${marker.kind}`}
                    style={{ top: `${geometry.minutesToPx(marker.minutes)}px` }}
                >
                    <span className="rhythm-marker-label">
                        {marker.kind === 'gate' ? `Closes ${marker.title}` : marker.title} · {marker.time}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default RhythmLayer;
