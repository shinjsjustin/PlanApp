import React from 'react';

import useProjectMutations from '../../hooks/useProjectMutations';
import { TODO_STATUS } from '../../lib/graph';
import InlineTitle from './InlineTitle';
import TodoNote from './TodoNote';

const STATUS_BUTTONS = [
    ['Incomplete', TODO_STATUS.incomplete],
    ['Blocked', TODO_STATUS.blocked],
    ['Complete', TODO_STATUS.complete],
];

const PhoneTodoEditor = ({ todo, onDone }) => {
    const { renameTodo, setTodoStatus, deleteTodo } = useProjectMutations();

    return (
        <div className="phone-todo-editor">
            <InlineTitle
                value={todo.text}
                label="To-do text"
                flushOnUnmount
                onSave={(text) => renameTodo(todo.id, text)}
            />
            <div className="phone-todo-statuses">
                {STATUS_BUTTONS.map(([label, status]) => (
                    <button
                        key={status}
                        type="button"
                        className="phone-todo-status"
                        aria-pressed={todo.status === status}
                        onClick={() => setTodoStatus(todo.id, status)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <TodoNote todo={todo} autoFocus={false} />
            <button type="button" className="phone-todo-delete" onClick={() => deleteTodo(todo.id)}>
                Delete
            </button>
            <button type="button" className="phone-todo-done" onClick={onDone}>
                Done
            </button>
        </div>
    );
};

export default PhoneTodoEditor;
