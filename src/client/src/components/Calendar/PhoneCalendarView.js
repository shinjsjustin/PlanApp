import React, { useEffect, useRef, useState } from 'react';

import DayGrid from './DayGrid';
import DayItemCard from './DayItemCard';
import NotePlane from './NotePlane';
import NowLine from './NowLine';
import useSwipe from '../../hooks/useSwipe';
import { dayLabel, todayKey } from '../../lib/dates';
import { itemKeyOf } from '../../lib/schedule';
import { INITIAL_SCROLL_MINUTES } from '../../lib/scheduleGeometry';
import { useCalendarContext } from '../../state/CalendarContext';
import { useDayGeometry } from '../../state/DayScaleContext';
import '../Styling/CalendarPhone.css';

const STEP_BY_DIRECTION = { left: 1, right: -1 };

// One read-only day at a time. It opens on the day dated today, else the first,
// and swiping left/right walks the list without wrapping.
const PhoneCalendarView = ({ notes, onOpenSource }) => {
    const { state, completeTodo } = useCalendarContext();
    const geometry = useDayGeometry();
    const scrollRef = useRef(null);
    const { days, items } = state;
    const [requestedIndex, setRequestedIndex] = useState(() =>
        Math.max(0, days.findIndex((d) => d.date === todayKey()))
    );

    const index = Math.min(requestedIndex, days.length - 1);
    const day = days[index];

    const onSwipe = (direction) => {
        const step = STEP_BY_DIRECTION[direction];
        if (!step) return;
        setRequestedIndex(Math.max(0, Math.min(index + step, days.length - 1)));
    };
    const swipeHandlers = useSwipe({ onSwipe });

    // Once, on mount, as DayColumn does: re-applying would yank the day back
    // to 06:00 whenever a booking changed.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = geometry.minutesToPx(INITIAL_SCROLL_MINUTES);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!day) return <p className="phone-day-empty">No days yet</p>;

    const label = `Day ${index + 1}`;
    const isToday = day.date === todayKey();
    const position = `${index + 1} of ${days.length}`;

    return (
        <section className="phone-day" aria-label={label} aria-current={isToday ? 'date' : undefined}>
            <header className="phone-day-header">
                <h2 className="phone-day-title">
                    {day.date ? (
                        <time dateTime={day.date}>{`${dayLabel(day.date)} · ${position}`}</time>
                    ) : (
                        `${label} of ${days.length}`
                    )}
                </h2>
                {isToday && <span className="phone-day-today-badge">Today</span>}
            </header>
            <div className="phone-day-scroll" ref={scrollRef} {...swipeHandlers}>
                <DayGrid>
                    <NotePlane dayId={day.id} notes={notes.notesForDay(day.id)} label={`Notes for ${label}`} />
                    {items
                        .filter((item) => item.dayId === day.id)
                        .map((item) => (
                            <DayItemCard
                                key={itemKeyOf(item)}
                                item={item}
                                onComplete={completeTodo}
                                onOpenSource={onOpenSource}
                            />
                        ))}
                    <NowLine date={day.date} />
                </DayGrid>
            </div>
        </section>
    );
};

export default PhoneCalendarView;
