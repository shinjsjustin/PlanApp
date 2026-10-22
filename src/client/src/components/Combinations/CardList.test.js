import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import CardList from './CardList';

const CARDS = [
    { id: 1, name: 'Fire', detail: 'hot' },
    { id: 2, name: 'Ice', detail: 'cold' },
    { id: 3, name: 'Wind', detail: '' },
];
const PAIRS = {
    '1|2': { state: 'done' },
    '1|3': { state: 'empty' },
    '2|3': { state: 'struck' },
};

const setup = (overrides = {}) => {
    const props = {
        cards: CARDS,
        pairs: PAIRS,
        addCard: jest.fn().mockResolvedValue({}),
        updateCard: jest.fn().mockResolvedValue({}),
        moveCard: jest.fn().mockResolvedValue({}),
        deleteCard: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
    render(<CardList {...props} />);
    return props;
};

const rows = () => screen.getAllByTestId('card-row');

describe('CardList rows', () => {
    it('shows each card name and detail in order', () => {
        setup();
        expect(rows().map((r) => within(r).getByLabelText('Card name').value)).toEqual(['Fire', 'Ice', 'Wind']);
        expect(within(rows()[1]).getByLabelText('Description of Ice').value).toBe('cold');
    });

    it('saves a changed name, trimmed', async () => {
        const props = setup();
        const input = within(rows()[0]).getByLabelText('Card name');
        fireEvent.change(input, { target: { value: '  Flame ' } });
        await act(async () => fireEvent.blur(input));
        expect(props.updateCard).toHaveBeenCalledWith(1, { name: 'Flame' });
    });

    it('saves a changed detail', async () => {
        const props = setup();
        const input = within(rows()[1]).getByLabelText('Description of Ice');
        fireEvent.change(input, { target: { value: 'frozen' } });
        await act(async () => fireEvent.blur(input));
        expect(props.updateCard).toHaveBeenCalledWith(2, { detail: 'frozen' });
    });

    it('does not save an unchanged value', () => {
        const props = setup();
        fireEvent.blur(within(rows()[0]).getByLabelText('Card name'));
        expect(props.updateCard).not.toHaveBeenCalled();
    });

    it('reverts an emptied name and says a card needs a name', () => {
        const props = setup();
        const input = within(rows()[0]).getByLabelText('Card name');
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.blur(input);
        expect(input.value).toBe('Fire');
        expect(props.updateCard).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('A card needs a name.');
    });

    it('shows a rejected save as a message', async () => {
        setup({ updateCard: jest.fn().mockRejectedValue(new Error('Server down')) });
        const input = within(rows()[0]).getByLabelText('Card name');
        fireEvent.change(input, { target: { value: 'Flame' } });
        fireEvent.blur(input);
        expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
    });

    it('shows a placeholder when there are no cards', () => {
        setup({ cards: [] });
        expect(screen.getByText('No cards yet.')).toBeInTheDocument();
    });
});

describe('CardList reorder', () => {
    it('calls moveCard with the direction', async () => {
        const props = setup();
        await act(async () => fireEvent.click(within(rows()[1]).getByRole('button', { name: 'Up' })));
        expect(props.moveCard).toHaveBeenCalledWith(2, 'up');
        await act(async () => fireEvent.click(within(rows()[1]).getByRole('button', { name: 'Down' })));
        expect(props.moveCard).toHaveBeenCalledWith(2, 'down');
    });

    it('disables Up on the first card and Down on the last', () => {
        setup();
        expect(within(rows()[0]).getByRole('button', { name: 'Up' })).toBeDisabled();
        expect(within(rows()[0]).getByRole('button', { name: 'Down' })).toBeEnabled();
        expect(within(rows()[2]).getByRole('button', { name: 'Down' })).toBeDisabled();
        expect(within(rows()[2]).getByRole('button', { name: 'Up' })).toBeEnabled();
    });

    it('shows a rejected move as a message', async () => {
        setup({ moveCard: jest.fn().mockRejectedValue(new Error('No move')) });
        fireEvent.click(within(rows()[1]).getByRole('button', { name: 'Up' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('No move');
    });
});

describe('CardList delete', () => {
    it('asks first, counting pairs and non-empty ones', () => {
        const props = setup();
        fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
        expect(screen.getByRole('dialog')).toHaveTextContent(
            'Delete "Fire"? Its 2 pairs go with it, including 1 not empty.',
        );
        expect(props.deleteCard).not.toHaveBeenCalled();
    });

    it('ends the message with a period when no pair is filled', () => {
        setup({ pairs: {} });
        fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('Delete "Fire"? Its 2 pairs go with it.');
    });

    it('counts only pairs that involve the card', () => {
        setup();
        fireEvent.click(within(rows()[2]).getByRole('button', { name: 'Delete' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('including 1 not empty.');
    });

    it('deletes on confirm and closes the dialog', async () => {
        const props = setup();
        fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
        await act(async () => fireEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
        ));
        expect(props.deleteCard).toHaveBeenCalledWith(1);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps the card when cancelled', () => {
        const props = setup();
        fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(props.deleteCard).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows a rejected delete as a message', async () => {
        setup({ deleteCard: jest.fn().mockRejectedValue(new Error('Cannot delete')) });
        fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Cannot delete');
    });
});

describe('CardList add form', () => {
    const fill = (name, detail) => {
        fireEvent.change(screen.getByLabelText('New card name'), { target: { value: name } });
        fireEvent.change(screen.getByLabelText('New card description'), { target: { value: detail } });
        fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    };

    it('adds a trimmed card, clears the fields and refocuses the name', async () => {
        const props = setup();
        fill('  Earth ', ' solid ');
        expect(props.addCard).toHaveBeenCalledWith('Earth', 'solid');
        await waitFor(() => expect(screen.getByLabelText('New card name').value).toBe(''));
        expect(screen.getByLabelText('New card description').value).toBe('');
        expect(screen.getByLabelText('New card name')).toHaveFocus();
    });

    it('asks for a name when it is empty', () => {
        const props = setup();
        fill('  ', 'solid');
        expect(props.addCard).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Give the new card a name.');
    });

    it('keeps the typed values and shows the message when adding fails', async () => {
        setup({ addCard: jest.fn().mockRejectedValue(new Error('Deck full')) });
        fill('Earth', 'solid');
        expect(await screen.findByRole('alert')).toHaveTextContent('Deck full');
        expect(screen.getByLabelText('New card name').value).toBe('Earth');
    });
});
