import React, { useState } from 'react';

import useReminders from '../../hooks/useReminders';
import usePlaces from '../../hooks/usePlaces';
import { groupByDue } from '../../lib/reminderGroups';
import { todayKey } from '../../lib/dates';
import FormDialog, { confirmDiscard } from '../AddressBook/FormDialog';
import ReminderForm from './ReminderForm';
import ReminderRow from './ReminderRow';
import SnoozeDialog from './SnoozeDialog';
import SubcategoryManager from './SubcategoryManager';
import '../Styling/Places.css';
import '../Styling/Reminders.css';

const ALL_PLACES = '';
const NO_PLACE = 'none';
const VIEWS = [
    { value: 'open', label: 'Open' },
    { value: 'snoozed', label: 'Snoozed' },
    { value: 'history', label: 'History' },
];
const SORTS = [
    { value: 'due', label: 'Due' },
    { value: 'place', label: 'Place' },
    { value: 'subcategory', label: 'Subcategory' },
    { value: 'created', label: 'Created' },
];
const DELETE_MESSAGE = 'Delete this reminder?';

const toPlaceId = (value) => {
    if (value === ALL_PLACES) return undefined;
    return value === NO_PLACE ? NO_PLACE : Number(value);
};

const RemindersPage = () => {
    const [placeValue, setPlaceValue] = useState(ALL_PLACES);
    const [view, setView] = useState('open');
    const [sort, setSort] = useState('due');
    const [dialog, setDialog] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);
    const placeId = toPlaceId(placeValue);
    const isSinglePlace = typeof placeId === 'number';
    const places = usePlaces();
    const reminders = useReminders({ placeId, status: view, sort });

    const closeDialog = () => {
        setDialog(null);
        setIsDirty(false);
        setSaveFailed(false);
    };

    const openDialog = (next) => {
        setDialog(next);
        setIsDirty(false);
        setSaveFailed(false);
    };

    const finish = async (call) => {
        const didSucceed = await call();
        if (didSucceed) closeDialog();
        else setSaveFailed(true);
        return didSucceed;
    };

    const submitForm = (fields) => finish(() => (
        dialog.reminder ? reminders.edit(dialog.reminder.id, fields) : reminders.add(fields)
    ));

    const submitSnooze = (until) => finish(() => reminders.snooze(dialog.reminder.id, until));

    const requestCancel = () => {
        if (confirmDiscard(isDirty)) closeDialog();
    };

    const confirmDelete = (call) => {
        if (window.confirm(DELETE_MESSAGE)) call();
    };

    const idAction = (action) => (reminder) => action(reminder.id);
    const isGrouped = view === 'open' && sort === 'due';

    const renderList = (items) => (
        <ul className="reminder-list">
            {items.map((reminder) => (
                <ReminderRow
                    key={reminder.id}
                    reminder={reminder}
                    onDone={idAction(reminders.done)}
                    onDismiss={idAction(reminders.dismiss)}
                    onReopen={idAction(reminders.reopen)}
                    onSnooze={(target) => openDialog({ kind: 'snooze', reminder: target, now: new Date() })}
                    onEdit={(target) => openDialog({ kind: 'form', reminder: target })}
                    onDelete={(target) => confirmDelete(() => reminders.remove(target.id))}
                />
            ))}
        </ul>
    );

    const dialogError = saveFailed ? reminders.error : null;

    return (
        <main className="reminders-page">
            <header className="places-header">
                <h1>Reminders</h1>
                <button type="button" className="neon-button" onClick={() => openDialog({ kind: 'form', reminder: null })}>
                    New reminder
                </button>
            </header>

            {reminders.error && <p role="alert" className="places-error">{reminders.error}</p>}

            <div className="reminders-controls">
                <label>
                    Place
                    <select className="place-input" value={placeValue} onChange={(event) => setPlaceValue(event.target.value)}>
                        <option value={ALL_PLACES}>All</option>
                        {places.places.map((place) => (
                            <option key={place.id} value={place.id}>{place.name}</option>
                        ))}
                        <option value={NO_PLACE}>No place</option>
                    </select>
                </label>
                <div className="reminders-views">
                    {VIEWS.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            className="neon-button"
                            aria-pressed={view === value}
                            onClick={() => setView(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <label>
                    Sort
                    <select className="place-input" value={sort} onChange={(event) => setSort(event.target.value)}>
                        {SORTS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>
            </div>

            {isSinglePlace && <SubcategoryManager placeId={placeId} onChanged={reminders.reload} />}

            {reminders.status === 'loading' && <p>Loading reminders...</p>}
            {reminders.status === 'ready' && reminders.reminders.length === 0 && <p>No reminders here.</p>}
            {reminders.status === 'ready' && reminders.reminders.length > 0 && (
                isGrouped ? groupByDue(reminders.reminders, todayKey()).map((group) => (
                    <section key={group.label}>
                        <h2 className="reminder-group-heading">{group.label}</h2>
                        {renderList(group.reminders)}
                    </section>
                )) : renderList(reminders.reminders)
            )}

            {dialog?.kind === 'form' && (
                <FormDialog
                    title={dialog.reminder ? 'Edit reminder' : 'New reminder'}
                    isDirty={isDirty}
                    error={dialogError}
                    onClose={closeDialog}
                >
                    <ReminderForm
                        reminder={dialog.reminder}
                        saveFailed={saveFailed}
                        onSubmit={submitForm}
                        onCancel={requestCancel}
                        onDelete={dialog.reminder ? () => confirmDelete(() => finish(() => reminders.remove(dialog.reminder.id))) : undefined}
                        onDirtyChange={setIsDirty}
                    />
                </FormDialog>
            )}
            {dialog?.kind === 'snooze' && (
                <SnoozeDialog now={dialog.now} error={dialogError} onSnooze={submitSnooze} onCancel={closeDialog} />
            )}
        </main>
    );
};

export default RemindersPage;
