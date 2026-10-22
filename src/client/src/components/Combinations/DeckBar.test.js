import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import DeckBar from './DeckBar';

const DECKS = [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }];

const setup = (props = {}) => {
    const handlers = {
        onSelect: jest.fn(),
        onCreate: jest.fn().mockResolvedValue({}),
        onRename: jest.fn().mockResolvedValue({}),
        onDelete: jest.fn().mockResolvedValue({}),
    };
    render(<DeckBar decks={DECKS} deckId={1} {...handlers} {...props} />);
    return handlers;
};

describe('DeckBar', () => {
    it('lists the decks and reports a selection by id', () => {
        const h = setup();
        expect(screen.getByLabelText('Deck')).toHaveValue('1');
        fireEvent.change(screen.getByLabelText('Deck'), { target: { value: '2' } });
        expect(h.onSelect).toHaveBeenCalledWith(2);
    });

    it('creates a deck from the inline input on Enter', async () => {
        const h = setup();
        fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
        const input = screen.getByLabelText('Deck name');
        fireEvent.change(input, { target: { value: 'Gamma' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(h.onCreate).toHaveBeenCalledWith('Gamma'));
        await waitFor(() => expect(screen.queryByLabelText('Deck name')).toBeNull());
    });

    it('cancels the inline input on Escape without calling anything', () => {
        const h = setup();
        fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
        fireEvent.keyDown(screen.getByLabelText('Deck name'), { key: 'Escape' });
        expect(screen.queryByLabelText('Deck name')).toBeNull();
        expect(h.onCreate).not.toHaveBeenCalled();
    });

    it('renames the open deck, starting from its current name', async () => {
        const h = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
        const input = screen.getByLabelText('Deck name');
        expect(input).toHaveValue('Alpha');
        fireEvent.change(input, { target: { value: 'Alpha 2' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(h.onRename).toHaveBeenCalledWith('Alpha 2'));
    });

    it('does not save a blank name', () => {
        const h = setup();
        fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
        fireEvent.keyDown(screen.getByLabelText('Deck name'), { key: 'Enter' });
        expect(h.onCreate).not.toHaveBeenCalled();
    });

    it('asks through the confirm dialog before deleting', async () => {
        const h = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Delete deck' }));
        expect(h.onDelete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(h.onDelete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete deck' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Delete deck' })[1]);
        await waitFor(() => expect(h.onDelete).toHaveBeenCalledTimes(1));
    });

    it('shows the failure message and keeps the input open', async () => {
        const onCreate = jest.fn().mockRejectedValue(new Error('A deck with that name exists'));
        setup({ onCreate });
        fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
        const input = screen.getByLabelText('Deck name');
        fireEvent.change(input, { target: { value: 'Alpha' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(await screen.findByRole('alert')).toHaveTextContent('A deck with that name exists');
        expect(screen.getByLabelText('Deck name')).toBeInTheDocument();
    });

    it('shows the failure message when a delete fails', async () => {
        setup({ onDelete: jest.fn().mockRejectedValue(new Error('Cannot delete')) });
        fireEvent.click(screen.getByRole('button', { name: 'Delete deck' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Delete deck' })[1]);
        expect(await screen.findByRole('alert')).toHaveTextContent('Cannot delete');
    });

    it('disables Rename and Delete when there is no open deck', () => {
        setup({ decks: [], deckId: undefined });
        expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Delete deck' })).toBeDisabled();
    });
});
