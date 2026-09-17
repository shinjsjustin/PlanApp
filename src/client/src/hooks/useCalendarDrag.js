import { useDraggable } from '@dnd-kit/core';

// The draggable wiring for the three things this page can lift: a pool row,
// which has no booking yet, a booking already in a day, and a note ribbon in a
// day's other plane. `data` is what `dragKindOf` reads to tell them apart on
// drop.
//
// They live here rather than beside `CalendarDragArea` because the components
// that call them are imported *by* that file, and importing back would be a
// cycle.

export const usePoolDrag = (todo) => {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `pool-${todo.todoId}`,
        data: { poolTodo: todo },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners } };
};

export const useBookingDrag = (todoId) => {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `booking-${todoId}`,
        data: { bookingTodoId: todoId },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners } };
};

/**
 * A note ribbon. A third thing this page can lift, and the one that lands in the
 * other plane: `dragKindOf` reads this to know a drop belongs to the notes
 * droppable rather than to a day's to-do plane.
 */
export const useNoteDrag = (noteId) => {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `note-${noteId}`,
        data: { noteId },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners } };
};
