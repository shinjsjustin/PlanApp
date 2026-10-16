import React from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';
import { TODO_STATUS } from '../../lib/graph';
import PhoneTodoEditor from './PhoneTodoEditor';

const CHECK = '✓';

// Phone row: the tick sets status, the text opens the editor below the row.
const PhoneTodoRow = ({ todo, isEditing, onToggleEdit }) => {
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
            <button
                type="button"
                className="phone-todo-text"
                aria-label={`Edit “${todo.text}”`}
                aria-expanded={isEditing}
                onClick={onToggleEdit}
            >
                {todo.text}
            </button>
            {isEditing && <PhoneTodoEditor todo={todo} onDone={onToggleEdit} />}
        </li>
    );
};

export default PhoneTodoRow;
