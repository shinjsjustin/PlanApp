import { render, screen, fireEvent } from '@testing-library/react';

import WalkView from './WalkView';

const STONE = [{ id: 1, name: 'Stone', onX: true, onY: true }];

const walk = (cards, recipe) => {
    const onOpen = jest.fn();
    render(
        <WalkView
            cards={cards}
            pairs={{}}
            mode="combinations"
            recipe={recipe}
            walkCardId={1}
            selectedKey={null}
            onOpen={onOpen}
            onSelectCard={jest.fn()}
        />,
    );
    return onOpen;
};

describe('WalkView with few cards', () => {
    it('lists and opens the Stone + Stone step in a one-card recipe deck', () => {
        const onOpen = walk(STONE, true);
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: /\+ Stone/ }));
        expect(onOpen).toHaveBeenCalledWith('1|1');
    });

    it('asks for at least one card in an empty recipe deck', () => {
        walk([], true);
        expect(screen.getByText(/Add at least one card below/)).toBeInTheDocument();
    });

    it('still asks for two cards with one card and no flag', () => {
        walk(STONE, false);
        expect(screen.getByText(/Add at least two cards below/)).toBeInTheDocument();
    });
});
