import React, { useMemo, useState } from 'react';

import useLivedMoments from '../../hooks/useLivedMoments';
import useSwipe from '../../hooks/useSwipe';
import { dayLabel, nextDateKey, previousDateKey } from '../../lib/dates';
import { CATEGORIES, livedTodayKey, weekOf } from '../../lib/lived';
import LivedDayTimeline from './LivedDayTimeline';
import LivedMomentSheet from './LivedMomentSheet';
import LivedWeekStrip from './LivedWeekStrip';
import '../Styling/Lived.css';

const groupByDate = (moments) =>
    moments.reduce((groups, moment) => ({ ...groups, [moment.date]: [...(groups[moment.date] ?? []), moment] }), {});

const LivedView = () => {
    const [day, setDay] = useState(() => livedTodayKey());
    const [selectedMoment, setSelectedMoment] = useState(null);
    const days = useMemo(() => weekOf(day), [day]);
    const { status, moments, error, reload } = useLivedMoments({ from: days[0], to: days[6] });
    const momentsByDate = useMemo(() => groupByDate(moments), [moments]);

    const openDay = (key) => {
        setSelectedMoment(null);
        setDay(key);
    };
    const swipe = useSwipe({
        onSwipe: (direction) => openDay(direction === 'left' ? nextDateKey(day) : previousDateKey(day)),
    });

    return (
        <div className="lived-view">
            <div className="lived-legend">
                {CATEGORIES.map((category) => (
                    <span key={category.key}>
                        <i style={{ '--c': `var(--lived-${category.key})` }} />
                        {category.label}
                    </span>
                ))}
            </div>
            <LivedWeekStrip days={days} momentsByDate={momentsByDate} selected={day} onSelect={openDay} />
            <div className="lived-story" {...swipe}>
                <div className="lived-story-head">
                    <button type="button" aria-label="Previous day" onClick={() => openDay(previousDateKey(day))}>‹</button>
                    <h3>{dayLabel(day)}</h3>
                    <button type="button" aria-label="Next day" onClick={() => openDay(nextDateKey(day))}>›</button>
                </div>
                {status === 'loading' && <p role="status" className="lived-empty">Loading…</p>}
                {status === 'error' && (
                    <div role="alert" className="lived-empty">
                        <p>{error}</p>
                        <button type="button" onClick={reload}>Retry</button>
                    </div>
                )}
                {status === 'ready' && (
                    <LivedDayTimeline moments={momentsByDate[day] ?? []} onSelect={setSelectedMoment} />
                )}
            </div>
            <LivedMomentSheet moment={selectedMoment} onClose={() => setSelectedMoment(null)} />
        </div>
    );
};

export default LivedView;
