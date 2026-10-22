import React, { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import usePeople from '../../hooks/usePeople';
import useReminderSubcategories from '../../hooks/useReminderSubcategories';
import { emptyDraft, fromReminder, toPayload, validate, WEEKDAYS } from '../../lib/reminderForm';
import PlaceSelect from '../Places/PlaceSelect';
import '../Styling/Places.css';

const TRIGGERS = [
    { value: 'none', label: 'None' },
    { value: 'arrive', label: 'Arrive' },
    { value: 'leave', label: 'Leave' },
];
const PRIORITIES = [
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
];
const REPEATS = [
    { value: 'none', label: 'None' },
    { value: 'daily', label: 'Daily' },
    { value: 'every_n_days', label: 'Every n days' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
];

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const toId = (value) => (value === '' ? null : Number(value));

// Loads the project list, and the chosen project's to-dos. A failure shows its message.
const useProjectChoices = (projectId) => {
    const [projects, setProjects] = useState([]);
    const [todos, setTodos] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isActive = true;
        api.get('/projects')
            .then((loaded) => isActive && setProjects(loaded))
            .catch((err) => isActive && setError(err?.message || GENERIC_FAILURE));
        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (projectId === null) {
            setTodos([]);
            return undefined;
        }
        let isActive = true;
        api.get(`/projects/${projectId}`)
            .then((graph) => isActive && setTodos(graph.todos))
            .catch((err) => isActive && setError(err?.message || GENERIC_FAILURE));
        return () => {
            isActive = false;
        };
    }, [projectId]);

    return { projects, todos, error };
};

const Select = ({ label, value, onChange, disabled, children }) => (
    <label className="place-field">
        {label}
        <select className="place-input" value={value} onChange={onChange} disabled={disabled}>
            {children}
        </select>
    </label>
);

const Options = ({ items }) =>
    items.map((item) => (
        <option key={item.value} value={item.value}>
            {item.label}
        </option>
    ));

const ReminderFormBody = ({ reminder, onSubmit, onCancel, onDelete, onDirtyChange, saveFailed }) => {
    const [startDraft] = useState(reminder ? fromReminder(reminder) : emptyDraft());
    const [draft, setDraft] = useState(startDraft);
    const [errors, setErrors] = useState([]);
    const isDirty = JSON.stringify(draft) !== JSON.stringify(startDraft);

    const people = usePeople();
    const { subcategories } = useReminderSubcategories(draft.placeId);
    const { projects, todos, error: projectError } = useProjectChoices(draft.projectId);

    useEffect(() => {
        if (onDirtyChange) onDirtyChange(isDirty);
    }, [isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

    const update = (changes) => setDraft((current) => ({ ...current, ...changes }));
    const setField = (field) => (event) => update({ [field]: event.target.value });
    const setId = (field, clears) => (event) => update({ [field]: toId(event.target.value), ...clears });

    const changePlace = (placeId) =>
        update({ placeId, subcategoryId: placeId === draft.placeId ? draft.subcategoryId : null });

    const toggleWeekday = (day) => (event) =>
        update({
            weekdays: event.target.checked
                ? [...draft.weekdays, day]
                : draft.weekdays.filter((existing) => existing !== day),
        });

    const submit = (event) => {
        event.preventDefault();
        const found = validate(draft);
        setErrors(found);
        if (found.length === 0) onSubmit(toPayload(draft));
    };

    return (
        <form className="place-form" onSubmit={submit} noValidate>
            <label className="place-field">
                Title
                <input className="place-input" type="text" value={draft.title} onChange={setField('title')} />
            </label>

            <PlaceSelect value={draft.placeId} onChange={changePlace} />
            <Select
                label="Subcategory"
                value={draft.subcategoryId ?? ''}
                onChange={setId('subcategoryId')}
                disabled={draft.placeId === null}
            >
                <option value="">No subcategory</option>
                {subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                ))}
            </Select>

            <label className="place-field">
                Due date
                <input className="place-input" type="date" value={draft.dueDate} onChange={setField('dueDate')} />
            </label>
            <label className="place-field">
                Due time
                <input className="place-input" type="time" value={draft.dueTime} onChange={setField('dueTime')} />
            </label>
            <label className="place-field">
                Alert
                <input className="place-input" type="datetime-local" value={draft.alertAt} onChange={setField('alertAt')} />
            </label>

            <Select label="Trigger" value={draft.trigger} onChange={setField('trigger')}>
                <Options items={TRIGGERS} />
            </Select>
            <Select label="Priority" value={draft.priority} onChange={setField('priority')}>
                <Options items={PRIORITIES} />
            </Select>

            <Select label="Person" value={draft.personId ?? ''} onChange={setId('personId')}>
                <option value="">No person</option>
                {people.people.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                ))}
            </Select>
            <Select label="Project" value={draft.projectId ?? ''} onChange={setId('projectId', { todoId: null })}>
                <option value="">No project</option>
                {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                ))}
            </Select>
            <Select
                label="To-do"
                value={draft.todoId ?? ''}
                onChange={setId('todoId')}
                disabled={draft.projectId === null}
            >
                <option value="">No to-do</option>
                {todos.map((todo) => (
                    <option key={todo.id} value={todo.id}>{todo.text}</option>
                ))}
            </Select>

            <Select label="Repeat" value={draft.repeatRule} onChange={setField('repeatRule')}>
                <Options items={REPEATS} />
            </Select>
            {draft.repeatRule === 'every_n_days' && (
                <label className="place-field">
                    Every (days)
                    <input
                        className="place-input"
                        type="number"
                        min="1"
                        max="365"
                        value={draft.every}
                        onChange={setField('every')}
                    />
                </label>
            )}
            {draft.repeatRule === 'weekly' && (
                <div className="place-field">
                    {WEEKDAYS.map((day) => (
                        <label key={day.value}>
                            <input
                                type="checkbox"
                                checked={draft.weekdays.includes(day.value)}
                                onChange={toggleWeekday(day.value)}
                            />
                            {day.label}
                        </label>
                    ))}
                </div>
            )}

            {projectError && <p className="places-error" role="alert">{projectError}</p>}
            {people.status === 'error' && <p className="places-error" role="alert">{people.error}</p>}
            {errors.map((message) => (
                <p key={message} className="places-error" role="alert">{message}</p>
            ))}
            {saveFailed && (
                <p className="places-error" role="alert">Could not save the reminder. Please try again.</p>
            )}

            <div className="place-actions">
                <button type="submit" className="neon-button">Save</button>
                {onCancel && (
                    <button type="button" className="neon-button" onClick={onCancel}>Cancel</button>
                )}
            </div>
            {onDelete && (
                <div className="place-actions">
                    <button type="button" className="neon-button reminder-delete" onClick={onDelete}>Delete</button>
                </div>
            )}
        </form>
    );
};

// Controlled form for a new reminder or an edit. `onSubmit(payload)` is called
// only with a valid draft; the parent reports a failed save through `saveFailed`.
const ReminderForm = (props) => (
    <PlaceOptionsProvider>
        <ReminderFormBody {...props} />
    </PlaceOptionsProvider>
);

export default ReminderForm;
