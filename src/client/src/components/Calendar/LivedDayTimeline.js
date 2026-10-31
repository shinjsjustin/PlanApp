import React from 'react';

import { formatMinutes, laneBlocks, labelMode, timelineRange } from '../../lib/lived';
import '../Styling/Lived.css';

const PX_PER_HOUR = 56;
const MINUTES_PER_HOUR = 60;

const toPx = (minutes) => (minutes / MINUTES_PER_HOUR) * PX_PER_HOUR;
const rangeLabel = (moment) =>
    `${formatMinutes(moment.startMinutes)}-${formatMinutes(moment.startMinutes + moment.durationMinutes)}`;

const LivedDayTimeline = ({ moments, onSelect }) => {
    if (moments.length === 0) return <p className="lived-empty">Nothing lived here yet</p>;

    const { start, end } = timelineRange(moments);
    const originals = new Map(moments.map((moment) => [moment.id, moment]));
    const hours = [];
    for (let minute = start; minute <= end; minute += MINUTES_PER_HOUR) hours.push(minute);
    const placed = (minutes) => `${toPx(minutes - start)}px`;

    return (
        <div className="lived-day">
            <div className="lived-gutter" style={{ height: `${toPx(end - start)}px` }}>
                {hours.map((minute) => (
                    <span key={minute} style={{ top: placed(minute) }}>{formatMinutes(minute)}</span>
                ))}
            </div>
            <div className="lived-lane" style={{ height: `${toPx(end - start)}px` }}>
                {hours.map((minute) => (
                    <div key={minute} className="lived-rule" style={{ top: placed(minute) }} />
                ))}
                {laneBlocks(moments).map((block) => {
                    const original = originals.get(block.id);
                    const heightPx = toPx(block.durationMinutes);
                    const mode = labelMode(block.durationMinutes, heightPx);
                    const firstLine = (block.detail ?? '').split('\n')[0];
                    const isDrive = block.category === 'drive';

                    return (
                        <button
                            key={block.id}
                            type="button"
                            className={isDrive ? 'lived-drive' : 'lived-block'}
                            aria-label={`${original.title}, ${rangeLabel(original)}`}
                            style={{
                                '--c': `var(--lived-${block.category})`,
                                top: placed(block.startMinutes),
                                height: `${heightPx}px`,
                            }}
                            onClick={() => onSelect(original)}
                        >
                            {!isDrive && mode !== 'colour' && <b className="lived-title">{block.title}</b>}
                            {!isDrive && mode === 'title-detail' && firstLine && (
                                <span className="lived-detail">{firstLine}</span>
                            )}
                        </button>
                    );
                })}
                {moments.flatMap((moment) =>
                    moment.chatTicks.map((minute) => (
                        <i key={`${moment.id}-${minute}`} className="lived-tick" style={{ top: placed(minute) }} />
                    ))
                )}
            </div>
        </div>
    );
};

export default LivedDayTimeline;
