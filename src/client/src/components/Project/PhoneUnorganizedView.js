import React, { useState } from 'react';

import { useProjectContext } from '../../state/ProjectContext';
import { sortByPosition } from '../../lib/graph';
import PhoneTodoRow from './PhoneTodoRow';
import TodoComposer from './TodoComposer';

// Full-screen phone page for to-dos not filed in any sequence. No swipe handlers
// here: leaving is only via Back.
const PhoneUnorganizedView = ({ onBack }) => {
    const { state } = useProjectContext();
    const [editingTodoId, setEditingTodoId] = useState(null);
    const todos = sortByPosition(
        Object.values(state.todos).filter((t) => t.sequenceId === null)
    );

    return (
        <div className="phone-unorganized">
            <div className="phone-unorganized-header">
                <button type="button" className="phone-unorganized-back" onClick={onBack}>
                    Back
                </button>
                <h2 className="phone-unorganized-title">Unorganized</h2>
            </div>
            {todos.length === 0 && <p className="phone-empty">Nothing unorganized</p>}
            <ul className="phone-todos">
                {todos.map((todo) => (
                    <PhoneTodoRow
                        key={todo.id}
                        todo={todo}
                        isEditing={editingTodoId === todo.id}
                        onToggleEdit={() => setEditingTodoId(editingTodoId === todo.id ? null : todo.id)}
                    />
                ))}
            </ul>
            <TodoComposer sequenceId={null} />
        </div>
    );
};

export default PhoneUnorganizedView;
