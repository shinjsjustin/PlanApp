import React from 'react';

import { nowPercent, timelineBar, timelineRange, weekMarks } from '../../lib/choreSchedule';
import '../Styling/Chores.css';

const percent = (value) => `${value}%`;

const barClass = (bar) =>
    [
        'chore-timeline-bar',
        `chore-timeline-bar--${bar.tone}`,
        bar.cutStart && 'chore-timeline-bar--cut-start',
        bar.cutEnd && 'chore-timeline-bar--cut-end',
    ].filter(Boolean).join(' ');

export default function ChoreTimeline({ chores, today, onSelect }) {
    const range = timelineRange(today);
    const dated = chores.filter((c) => c.dueBy);
    const neverCount = chores.length - dated.length;

    return (
        <section className="chore-timeline" aria-label="Schedule">
            {dated.length > 0 && (
                <div className="chore-timeline-scroll">
                    <div className="chore-timeline-track">
                        {weekMarks(range).map((mark) => (
                            <span key={mark.key} className="chore-timeline-week" style={{ left: percent(mark.left) }}>
                                {mark.label}
                            </span>
                        ))}
                        <div className="chore-timeline-now" style={{ left: percent(nowPercent(range, today)) }}>NOW</div>
                        {dated.map((chore) => {
                            const bar = timelineBar(chore, range, today);

                            return (
                                <button key={chore.id} type="button" className="chore-timeline-row" onClick={() => onSelect(chore)}>
                                    <span className="chore-timeline-label">{chore.name}</span>
                                    <span className={barClass(bar)} style={{ left: percent(bar.left), width: percent(bar.width) }} />
                                    {bar.tail && (
                                        <span
                                            className="chore-timeline-tail"
                                            style={{ left: percent(bar.tail.left), width: percent(bar.tail.width) }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {neverCount > 0 && <p className="chore-timeline-never">{neverCount} never done</p>}
        </section>
    );
}
