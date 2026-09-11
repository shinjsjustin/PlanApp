import { useDraggable } from '@dnd-kit/core';

// The draggable wiring for the two things this page can lift: a pool row, which
// has no booking yet, and a booking already in a day. `data` is what
// `dragKindOf` reads to tell them apart on drop.
//
// They live here rather than beside `CalendarDragArea` because the components
// that call them are imported *by* that file, and importing back would be a
// cycle.

export const usePoolDrag = (todo) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `pool-${todo.todoId}`,
        data: { poolTodo: todo },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners }, isDragging };
};

export const useBookingDrag = (todoId) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `booking-${todoId}`,
        data: { bookingTodoId: todoId },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners }, isDragging };
};
