import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import useIsPhone from '../../hooks/useIsPhone';
import usePeople from '../../hooks/usePeople';
import usePlaces from '../../hooks/usePlaces';
import FormDialog, { confirmDiscard } from './FormDialog';
import PersonForm, { PERSON_GROUPS } from './PersonForm';
import PlaceForm from '../Places/PlaceForm';
import PeopleSection from './PeopleSection';
import PlacesSection from './PlacesSection';
import '../Styling/Places.css';
import '../Styling/AddressBook.css';

const AddressBookPage = () => {
    const isPhone = useIsPhone();
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('');
    const people = usePeople();
    const places = usePlaces();
    const [dialog, setDialog] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);

    // A place's name is embedded in each person, so people must refresh after a place changes.
    const afterPlaceChange = (call) => async (...args) => {
        const didChange = await call(...args);
        if (didChange) people.reload();
        return didChange;
    };

    const closeDialog = () => {
        setDialog(null);
        setIsDirty(false);
        setSaveFailed(false);
    };

    const openDialog = (kind) => (item) => {
        setDialog({ kind, item });
        setIsDirty(false);
        setSaveFailed(false);
    };

    const requestCancel = () => {
        if (confirmDiscard(isDirty)) closeDialog();
    };

    const placeEdit = afterPlaceChange(places.edit);
    const saveFns = {
        person: (item) => (item ? (fields) => people.edit(item.id, fields) : people.add),
        place: (item) => (item ? (fields) => placeEdit(item.id, fields) : places.add),
    };

    const submitDialog = async (fields) => {
        const didSave = await saveFns[dialog.kind](dialog.item)(fields);
        if (didSave) closeDialog();
        else setSaveFailed(true);
        return didSave;
    };

    const isPerson = dialog?.kind === 'person';
    const isNew = dialog && !dialog.item;
    const dialogError = saveFailed ? (isPerson ? people.error : places.error) : null;
    const formProps = {
        initial: dialog?.item,
        submitLabel: isNew ? `Add ${dialog.kind}` : 'Save',
        onSubmit: submitDialog,
        onCancel: requestCancel,
        onDirtyChange: setIsDirty,
    };

    return (
        <main className={isPhone ? 'address-book-page address-book-page--phone' : 'address-book-page'}>
            <header className="places-header">
                <h1>Address Book</h1>
                <button type="button" className="neon-button" onClick={() => openDialog('person')()}>Add person</button>
                <button type="button" className="neon-button" onClick={() => openDialog('place')()}>Add place</button>
                {!isPhone && (
                    <>
                        <Link className="neon-button" to="/projects">Projects</Link>
                        <Link className="neon-button" to="/calendar">Calendar</Link>
                        <Link className="neon-button" to="/thoughts">Thoughts</Link>
                    </>
                )}
            </header>

            {people.error && <p role="alert" className="places-error">{people.error}</p>}
            {places.error && <p role="alert" className="places-error">{places.error}</p>}

            <div className="address-book-filters">
                <label>
                    Search
                    <input
                        type="search"
                        className="place-input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
                <label>
                    Group
                    <select className="place-input" value={group} onChange={(event) => setGroup(event.target.value)}>
                        <option value="">All groups</option>
                        {PERSON_GROUPS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>
            </div>

            <PeopleSection
                people={people.people}
                places={places.places}
                query={query}
                group={group}
                status={people.status}
                onOpenEdit={openDialog('person')}
                onRemove={people.remove}
            />
            <PlacesSection
                places={places.places}
                startPlaceId={places.startPlaceId}
                status={places.status}
                query={query}
                onOpenEdit={openDialog('place')}
                onRemove={afterPlaceChange(places.remove)}
                onSetStart={places.setStart}
            />
            {dialog && (
                <FormDialog
                    title={`${isNew ? 'New' : 'Edit'} ${dialog.kind}`}
                    isDirty={isDirty}
                    error={dialogError}
                    onClose={closeDialog}
                >
                    {isPerson
                        ? <PersonForm {...formProps} places={places.places} />
                        : <PlaceForm {...formProps} />}
                </FormDialog>
            )}
        </main>
    );
};

export default AddressBookPage;
