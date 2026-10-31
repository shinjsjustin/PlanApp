import React from 'react';

import { dayMarks, nowPercent, timelineBar, timelineRange, weekMarks } from '../../lib/choreSchedule';
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
    const now = nowPercent(range, today);
    const neverCount = chores.length - dated.length;

    return (
        <section className="chore-timeline" aria-label="Schedule">
            {dated.length > 0 ? (
                <div className="chore-timeline-scroll">
                    <div className="chore-timeline-track">
                        <div className="chore-timeline-head">
                            <span className="chore-timeline-now-tag" style={{ left: percent(now) }}>NOW</span>
                            <div className="chore-timeline-dates">
                                {weekMarks(range).map((mark) => (
                                    <span key={mark.key} className="chore-timeline-week" style={{ left: percent(mark.left) }}>
                                        {mark.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="chore-timeline-grid">
                            {dayMarks(range).map((mark) => (
                                <span
                                    key={mark.key}
                                    className={mark.isWeekStart ? 'chore-timeline-day chore-timeline-day--week' : 'chore-timeline-day'}
                                    style={{ left: percent(mark.left) }}
                                />
                            ))}
                        </div>
                        <div className="chore-timeline-now" style={{ left: percent(now) }} />
                        {dated.map((chore) => {
                            const bar = timelineBar(chore, range, today);

                            return (
                                <button key={chore.id} type="button" className="chore-timeline-row" onClick={() => onSelect(chore)}>
                                    <span className="chore-timeline-label" title={chore.name}>{chore.name}</span>
                                    <span className="chore-timeline-lane">
                                        <span className={barClass(bar)} style={{ left: percent(bar.left), width: percent(bar.width) }} />
                                        {bar.tail && (
                                            <span
                                                className="chore-timeline-tail"
                                                style={{ left: percent(bar.tail.left), width: percent(bar.tail.width) }}
                                            />
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <p className="chore-timeline-empty">Mark a chore done to start its schedule</p>
            )}
            {neverCount > 0 && <p className="chore-timeline-never">{neverCount} never done</p>}
        </section>
    );
}
