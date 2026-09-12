import React from 'react';

import PanelTodoRow from './PanelTodoRow';

// One project in the pool, folded or open.
//
// Folded it shows a name and a count of unscheduled work; open it shows the same
// header and the rows. A click anywhere on the header toggles it — there is no
// hover behaviour, deliberately: the panel is a drag source, and a card that
// opened under the pointer during a drag would move the very rows being aimed at.
//
// The count is unscheduled work only. It measures planning progress — how much
// startable work is still unbooked — and ticks down as days fill (decision 5).
// It is left off entirely when the calendar has not loaded, because then there is
// no answer to give rather than an answer of zero.
//
// Whether a card is open is browser-local and not persisted. Unlike a sequence
// card's `is_collapsed`, nothing here is worth a column: the pool is rebuilt from
// the frontier on every visit anyway. It is held by the page rather than here,
// though: this card is remounted whenever the calendar crosses between its failed
// and ready branches, and state held here would not survive a retry.

const ProjectAccordionCard = ({
    project,
    scheduledByTodoId,
    dragFor = null,
    isExpanded,
    onToggle,
}) => {
    const unscheduledCount = scheduledByTodoId
        ? project.todos.filter((todo) => !scheduledByTodoId.has(todo.todoId)).length
        : null;

    return (
        <li className={`pool-card${isExpanded ? ' pool-card--expanded' : ''}`}>
            <button
                type="button"
                className="pool-card-header"
                aria-expanded={isExpanded}
                onClick={onToggle}
            >
                <span className="pool-card-title">{project.title}</span>
                {unscheduledCount !== null && (
                    <span className="pool-card-count">{unscheduledCount}</span>
                )}
            </button>

            {isExpanded &&
                (project.todos.length === 0 ? (
                    <p className="pool-card-empty">Nothing startable in this project.</p>
                ) : (
                    <ul className="pool-card-todos">
                        {project.todos.map((todo) => (
                            <PanelTodoRow
                                key={todo.todoId}
                                todo={todo}
                                scheduled={scheduledByTodoId?.get(todo.todoId) ?? null}
                                isDraggable={dragFor ? dragFor(todo) : false}
                            />
                        ))}
                    </ul>
                ))}
        </li>
    );
};

export default ProjectAccordionCard;
