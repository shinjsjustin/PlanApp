import React, { useEffect, useRef, useState } from 'react';

import AllDayEvents from './AllDayEvents';
import DayGrid from './DayGrid';
import DayItemCard from './DayItemCard';
import DriveLayer from './DriveLayer';
import EventLayer from './EventLayer';
import NotePlane from './NotePlane';
import NowLine from './NowLine';
import useDateEvents from '../../hooks/useDateEvents';
import useSwipe from '../../hooks/useSwipe';
import { dayLabel, nextDateKey, previousDateKey, todayKey } from '../../lib/dates';
import { itemKeyOf } from '../../lib/schedule';
import { INITIAL_SCROLL_MINUTES } from '../../lib/scheduleGeometry';
import { useCalendarContext } from '../../state/CalendarContext';
import { useDayGeometry } from '../../state/DayScaleContext';
import '../Styling/CalendarPhone.css';

// Shared, so a view given no events hands the layers the same array each render.
const NO_EVENTS = [];
const NO_ITEMS = [];

const STEP_BY_DIRECTION = { left: nextDateKey, right: previousDateKey };

// One read-only date at a time, opening on today. Arrows and left/right swipes
// walk real dates without end; a date with no day record shows its Google events.
const PhoneCalendarView = ({ notes, onOpenSource, events = null }) => {
    const { state, completeTodo } = useCalendarContext();
    const geometry = useDayGeometry();
    const scrollRef = useRef(null);
    const { days, items } = state;
    const [selectedDate, setSelectedDate] = useState(todayKey);

    const day = days.find((d) => d.date === selectedDate);
    const dateEvents = useDateEvents(selectedDate, !day);

    const step = (stepFn) => setSelectedDate((date) => stepFn(date));
    const swipeHandlers = useSwipe({
        onSwipe: (direction) => {
            const stepFn = STEP_BY_DIRECTION[direction];
            if (stepFn) step(stepFn);
        },
    });

    // Once, on mount, as DayColumn does: re-applying would yank the day back
    // to 06:00 whenever a booking changed.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = geometry.minutesToPx(INITIAL_SCROLL_MINUTES);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const label = dayLabel(selectedDate);
    const isToday = selectedDate === todayKey();
    const dayItems = day ? items.filter((item) => item.dayId === day.id) : NO_ITEMS;
    const shownEvents = day ? (events ? events.eventsForDay(day.id) : NO_EVENTS) : dateEvents.events;

    return (
        <section className="phone-day" aria-label={label} aria-current={isToday ? 'date' : undefined}>
            <header className="phone-day-header">
                <button type="button" className="phone-day-step" onClick={() => step(previousDateKey)}>
                    Previous day
                </button>
                <h2 className="phone-day-title">
                    <time dateTime={selectedDate}>{label}</time>
                </h2>
                <button type="button" className="phone-day-step" onClick={() => step(nextDateKey)}>
                    Next day
                </button>
                {isToday && <span className="phone-day-today-badge">Today</span>}
                <AllDayEvents events={shownEvents} />
                {!day && <p className="phone-day-nothing">Nothing booked</p>}
                {!day && dateEvents.isUnavailable && (
                    <p className="phone-day-unavailable">Google events unavailable</p>
                )}
            </header>
            <div className="phone-day-scroll" ref={scrollRef} {...swipeHandlers}>
                <DayGrid>
                    {day && <NotePlane dayId={day.id} notes={notes.notesForDay(day.id)} label={`Notes for ${label}`} />}
                    <EventLayer events={shownEvents} />
                    <DriveLayer date={selectedDate} items={dayItems} events={shownEvents} />
                    {dayItems.map((item) => (
                        <DayItemCard
                            key={itemKeyOf(item)}
                            item={item}
                            onComplete={completeTodo}
                            onOpenSource={onOpenSource}
                        />
                    ))}
                    <NowLine date={selectedDate} />
                </DayGrid>
            </div>
        </section>
    );
};

export default PhoneCalendarView;
