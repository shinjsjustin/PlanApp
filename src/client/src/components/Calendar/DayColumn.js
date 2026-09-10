import React, { useEffect, useRef, useState } from 'react';

import ConfirmDialog from '../Project/ConfirmDialog';
import DayGrid from './DayGrid';
import DayItemCard from './DayItemCard';
import DeleteBubble from '../common/DeleteBubble';
import { INITIAL_SCROLL_MINUTES, minutesToPx } from '../../lib/scheduleGeometry';
import { useCalendarContext } from '../../state/CalendarContext';

// One day: a header, a delete control, and 24 hours that scroll inside it.
//
// The inner scroll is what makes the side-by-side layout work at all. A day is
// 1152px tall at a readable scale, so a strip of full-height columns would put
// the whole page inside one enormous scroll; giving each column its own keeps
// adjacent days adjacent, which matters because the overflow rule is constantly
// moving work between them (design decision 9).
//
// It opens at 06:00 rather than midnight: the top six hours of most days are
// empty, and starting there would mean scrolling before anything can be done.
//
// A day has no name. Its header is where it sits and when it was made, which is
// what a day *is* here — an ordered container, not a date (design decision 2).

const DayColumn = ({ day, index, items, onOpenSource, droppable = null, children }) => {
    const { deleteDay, completeTodo, isUnsavedDay } = useCalendarContext();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const scrollRef = useRef(null);

    const label = `Day ${index + 1}`;

    // Once, on mount. Re-applying it on every render would yank the column back
    // to 06:00 every time a booking moved.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = minutesToPx(INITIAL_SCROLL_MINUTES);
        }
    }, []);

    // Deleting an empty day releases nothing, so it does not warrant a prompt —
    // the same rule `LayerRow` applies to an empty layer.
    const requestDelete = () => {
        if (items.length > 0) {
            setIsConfirmingDelete(true);
            return;
        }

        deleteDay(day.id);
    };

    const confirmDelete = () => {
        setIsConfirmingDelete(false);
        deleteDay(day.id);
    };

    const deleteMessage =
        `Its ${items.length} booking${items.length === 1 ? '' : 's'} ` +
        'will be released. The to-dos are not deleted — they return to the ' +
        'project panel, ready to be scheduled again.';

    return (
        <section className="day-column has-delete-bubble" aria-label={label}>
            <header className="day-column-header">
                <h2 className="day-column-title">{label}</h2>
                <time className="day-column-stamp" dateTime={day.createdAt}>
                    {new Date(day.createdAt).toLocaleString()}
                </time>
            </header>

            {/* A day the server has not stored yet has no id to address, so
                `DELETE /calendar/days/-1` would come back a 400 and roll the
                column back into existence. The × appears once the save lands,
                which for a day the + created is the very next tick. */}
            {!isUnsavedDay(day.id) && (
                <DeleteBubble label={`Delete ${label}`} onDelete={requestDelete} />
            )}

            <div className="day-column-scroll" ref={scrollRef}>
                <div ref={droppable?.setNodeRef} className={droppable?.className}>
                    <DayGrid>
                        {items.map((item) => (
                            <DayItemCard
                                key={item.todoId}
                                item={item}
                                onComplete={completeTodo}
                                onOpenSource={onOpenSource}
                            />
                        ))}
                        {children}
                    </DayGrid>
                </div>
            </div>

            {isConfirmingDelete && (
                <ConfirmDialog
                    title={`Delete ${label}?`}
                    message={deleteMessage}
                    confirmLabel="Delete day and release its bookings"
                    onConfirm={confirmDelete}
                    onCancel={() => setIsConfirmingDelete(false)}
                />
            )}
        </section>
    );
};

export default DayColumn;
