import React from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';
import { TODO_STATUS } from '../../lib/graph';

const CHECK = '✓';

// Read-only row for the phone view: the tick is the only control.
const PhoneTodoRow = ({ todo }) => {
    const { setTodoStatus } = useProjectMutations();
    const isComplete = todo.status === TODO_STATUS.complete;

    return (
        <li className={`phone-todo${isComplete ? ' phone-todo--done' : ''}`}>
            <button
                type="button"
                className="phone-todo-tick"
                aria-pressed={isComplete}
                aria-label={
                    isComplete
                        ? `Mark “${todo.text}” incomplete`
                        : `Complete “${todo.text}” (${todo.status === TODO_STATUS.blocked ? 'Blocked' : 'Incomplete'})`
                }
                onClick={() =>
                    setTodoStatus(todo.id, isComplete ? TODO_STATUS.incomplete : TODO_STATUS.complete)
                }
            >
                {isComplete && <span aria-hidden="true">{CHECK}</span>}
            </button>
            <span className="phone-todo-text">{todo.text}</span>
        </li>
    );
};

export default PhoneTodoRow;
