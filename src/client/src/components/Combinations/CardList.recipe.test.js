import { render, screen, within } from '@testing-library/react';

import CardList from './CardList';

const CARDS = [
    { id: 1, name: 'Stone', detail: '' },
    { id: 2, name: 'Axe', detail: '' },
];

const setup = (props = {}) => render(
    <CardList cards={CARDS} pairs={{}} addCard={jest.fn()} updateCard={jest.fn()} moveCard={jest.fn()} deleteCard={jest.fn()} {...props} />,
);

describe('CardList kind badges', () => {
    it('shows a base or crafted badge per row from kinds', () => {
        setup({ kinds: { 1: 'base', 2: 'crafted' } });
        const [first, second] = screen.getAllByTestId('card-row');
        expect(within(first).getByText('base')).toBeInTheDocument();
        expect(within(second).getByText('crafted')).toBeInTheDocument();
        expect(within(first).queryByText('crafted')).toBeNull();
    });

    it('shows no badge without kinds', () => {
        setup();
        expect(screen.queryByText('base')).toBeNull();
        expect(screen.queryByText('crafted')).toBeNull();
    });
});
