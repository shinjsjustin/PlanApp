import React, { useRef, useState } from 'react';

import { getPair } from '../../lib/combinations';
import ConfirmDialog from '../Project/ConfirmDialog';

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const CardList = ({ cards, pairs, kinds, addCard, updateCard, moveCard, deleteCard }) => {
    const [message, setMessage] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const newNameRef = useRef(null);
    const newDetailRef = useRef(null);

    const attempt = async (call) => {
        try {
            await call();
            setMessage(null);
            return true;
        } catch (err) {
            setMessage(err?.message || GENERIC_FAILURE);
            return false;
        }
    };

    const saveName = (card, input) => {
        const name = input.value.trim();
        if (!name) {
            input.value = card.name;
            setMessage('A card needs a name.');
            return;
        }
        if (name !== card.name) attempt(() => updateCard(card.id, { name }));
    };

    const saveDetail = (card, input) => {
        const detail = input.value.trim();
        if (detail !== card.detail) attempt(() => updateCard(card.id, { detail }));
    };

    const askDelete = (card) => {
        const others = cards.filter((c) => c.id !== card.id);
        const filled = others.filter((c) => getPair(pairs, card.id, c.id).state !== 'empty').length;
        const tail = filled ? `, including ${filled} not empty.` : '.';
        setPendingDelete({
            id: card.id,
            message: `Delete "${card.name}"? Its ${others.length} pairs go with it${tail}`,
        });
    };

    const confirmDelete = () => {
        const { id } = pendingDelete;
        setPendingDelete(null);
        attempt(() => deleteCard(id));
    };

    const handleAdd = async (event) => {
        event.preventDefault();
        const name = newNameRef.current.value.trim();
        if (!name) {
            setMessage('Give the new card a name.');
            return;
        }
        const isAdded = await attempt(() => addCard(name, newDetailRef.current.value.trim()));
        if (!isAdded) return;
        newNameRef.current.value = '';
        newDetailRef.current.value = '';
        newNameRef.current.focus();
    };

    return (
        <>
            <h2>Cards</h2>
            {message && <p className="deck-error" role="alert">{message}</p>}
            <div className="card-rows">
                {cards.length === 0 && <p className="placeholder">No cards yet.</p>}
                {cards.map((card, index) => (
                    <div className={kinds ? 'card-row has-kind' : 'card-row'} data-testid="card-row" key={card.id}>
                        {kinds && <span className={`kind-badge ${kinds[card.id]}`}>{kinds[card.id]}</span>}
                        <input
                            className="name"
                            defaultValue={card.name}
                            aria-label="Card name"
                            onBlur={(e) => saveName(card, e.target)}
                        />
                        <input
                            className="detail"
                            defaultValue={card.detail}
                            placeholder="One-line description"
                            aria-label={`Description of ${card.name}`}
                            onBlur={(e) => saveDetail(card, e.target)}
                        />
                        <div className="card-actions">
                            <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => attempt(() => moveCard(card.id, 'up'))}
                            >
                                Up
                            </button>
                            <button
                                type="button"
                                disabled={index === cards.length - 1}
                                onClick={() => attempt(() => moveCard(card.id, 'down'))}
                            >
                                Down
                            </button>
                            <button type="button" className="danger" onClick={() => askDelete(card)}>
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <form className="card-add" onSubmit={handleAdd}>
                <input ref={newNameRef} placeholder="New card name" aria-label="New card name" />
                <input
                    ref={newDetailRef}
                    className="detail"
                    placeholder="One-line description"
                    aria-label="New card description"
                />
                <button type="submit">Add card</button>
            </form>
            {pendingDelete && (
                <ConfirmDialog
                    title="Delete card"
                    message={pendingDelete.message}
                    confirmLabel="Delete"
                    onConfirm={confirmDelete}
                    onCancel={() => setPendingDelete(null)}
                />
            )}
        </>
    );
};

export default CardList;
