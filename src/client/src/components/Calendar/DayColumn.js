import React, { useCallback, useEffect, useRef, useState } from 'react';

import ConfirmDialog from '../Project/ConfirmDialog';
import DayGrid from './DayGrid';
import DayItemCard from './DayItemCard';
import DeleteBubble from '../common/DeleteBubble';
import NotePlane from './NotePlane';
import { INITIAL_SCROLL_MINUTES } from '../../lib/scheduleGeometry';
import { useCalendarContext } from '../../state/CalendarContext';
import { useDayGeometry } from '../../state/DayScaleContext';

// One day: a header, a delete control, and 24 hours that scroll inside it.
//
// The inner scroll is what makes the side-by-side layout work at all. A day is
// 1152px tall at a readable scale, so a strip of full-height columns would put
// the whole page inside one enormous scroll; giving each column its own keeps
// adjacent days adjacent, which matters because the overflow rule is constantly
// moving work between them (design decision 9).
//
// The column is split down the middle: notes on the left, bookings on the right
// (design 2026-09-16, section 8.1). The hour gutter sits outside that split, so
// it is the gutter, then two equal halves. Both planes are absolutely positioned
// over the same `DayGrid`, which is what keeps one clock face for both.
//
// It opens at 06:00 rather than midnight: the top six hours of most days are
// empty, and starting there would mean scrolling before anything can be done.
//
// A day has no name. Its header is where it sits and when it was made, which is
// what a day *is* here — an ordered container, not a date (design decision 2).

// `droppable` comes from the one wrapper that has a `DndContext` around it, and
// defaults off so the column renders bare in a test.
//
// `cardFor` draws one booking, and exists for the same reason `DayStrip`'s
// `columnFor` does, one level down: a resizable card needs a hook per edge, and
// hooks cannot be called from a loop in here. The wrapper that holds the
// schedule supplies them; absent, the column draws a plain card. A caller that
// takes the render over owns the key, as `columnFor`'s does.
//
// `notePlane` is the same bargain one plane up: the gestures on a note live in
// the wrapper that has the `DndContext`, so it supplies a fully wired plane and
// the column simply gives it its place in the grid. Absent, the column draws a
// read-only plane from `notes`.

/**
 * The empty day, shared.
 *
 * Module-level rather than a `notes = []` default, because a default parameter
 * evaluates on every render and would hand `NotePlane` a new array each time —
 * which is exactly what its `assignLanes` memo keys on, so the memo would
 * recompute on every render of every column with no notes. The same reason
 * `useCalendarNotes` keeps one `EMPTY_NOTES`, and the identity guarantee that
 * hook makes reaches this far only if nothing downstream throws it away.
 */
const NO_NOTES = [];

const DayColumn = ({
    day,
    index,
    items,
    onOpenSource,
    droppable = null,
    cardFor = null,
    registerViewport = null,
    notes = NO_NOTES,
    notePlane = null,
    children,
}) => {
    const { deleteDay, completeTodo, isUnsavedDay } = useCalendarContext();
    const geometry = useDayGeometry();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const scrollRef = useRef(null);

    const label = `Day ${index + 1}`;

    /**
     * The scroll element does two jobs, so it takes two refs.
     *
     * `scrollRef` is this column's own, for the opening scroll below.
     * `registerViewport` hands the same node to `useDayScale`, which measures it
     * to decide the scale — it measures the viewport and never the grid, because
     * the grid's height is derived from the scale and measuring it would be a
     * loop (see that hook's header).
     */
    const attachScroll = useCallback(
        (node) => {
            scrollRef.current = node;
            registerViewport?.(node);
        },
        [registerViewport]
    );

    // Once, on mount. Re-applying it on every render would yank the column back
    // to 06:00 every time a booking moved.
    //
    // A no-op once the scale has grown enough for all 24 hours to fit: there is
    // then nothing to scroll, and `scrollTop` on a viewport with no overflow
    // stays 0 on its own. No branch needed.
    //
    // The one case this gives up on: a window grown past a whole day and then
    // shrunk back. The column is scrollable again but sits at 00:00, because the
    // browser clamped `scrollTop` to 0 while it fitted and nothing re-anchors it.
    // Re-anchoring would mean depending on `geometry` here, which is the yank
    // above — a rarer annoyance is the better trade.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = geometry.minutesToPx(INITIAL_SCROLL_MINUTES);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

            <div className="day-column-scroll" ref={attachScroll}>
                <div ref={droppable?.setNodeRef} className={droppable?.className}>
                    <DayGrid>
                        {/* The notes plane is drawn inside the same grid as the
                            bookings so the two planes share one clock face and
                            cannot drift apart by a pixel. It is a sibling of the
                            cards, not a container for them: they are independent
                            (decision 1). */}
                        {notePlane ? (
                            notePlane
                        ) : (
                            <NotePlane dayId={day.id} notes={notes} label={`Notes for ${label}`} />
                        )}

                        {items.map((item) =>
                            cardFor ? (
                                cardFor(item)
                            ) : (
                                <DayItemCard
                                    key={item.todoId}
                                    item={item}
                                    onComplete={completeTodo}
                                    onOpenSource={onOpenSource}
                                />
                            )
                        )}
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
