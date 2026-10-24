import { render, screen, fireEvent } from '@testing-library/react';

import WalkView from './WalkView';

const CARDS = [
    { id: 1, name: 'Fire', detail: 'Hot stuff' },
    { id: 2, name: 'Ice', detail: '' },
    { id: 3, name: 'Wind', detail: '' },
];
const PAIRS = { '1|2': { state: 'done', name: 'Steam' } };

const setup = (overrides = {}) => {
    const props = { onOpen: jest.fn(), onSelectCard: jest.fn() };
    const utils = render(
        <WalkView cards={CARDS} pairs={PAIRS} walkCardId={1} selectedKey={null} {...props} {...overrides} />,
    );
    return { ...props, ...utils };
};

describe('WalkView', () => {
    it('lists the card select with every card, the walk card chosen', () => {
        setup({ walkCardId: 2 });
        const select = screen.getByRole('combobox', { name: 'Card' });
        expect(select.value).toBe('2');
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Fire', 'Ice', 'Wind']);
    });

    it('reports the chosen card id as a number', () => {
        const { onSelectCard } = setup();
        fireEvent.change(screen.getByRole('combobox', { name: 'Card' }), { target: { value: '3' } });
        expect(onSelectCard).toHaveBeenCalledWith(3);
    });

    it('shows the card detail only when it has one', () => {
        const { unmount } = setup();
        expect(screen.getByText('Hot stuff')).toBeInTheDocument();
        unmount();
        setup({ walkCardId: 2 });
        expect(screen.queryByText('Hot stuff')).toBeNull();
    });

    it('numbers a row per partner with state dot and name or state', () => {
        const { container } = setup();
        const rows = container.querySelectorAll('ol.walk-list li button');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('1.');
        expect(rows[0]).toHaveTextContent('+ Ice');
        expect(rows[0]).toHaveTextContent('Steam');
        expect(rows[0].querySelector('i.dot.st-done')).not.toBeNull();
        expect(rows[1]).toHaveTextContent('2.');
        expect(rows[1]).toHaveTextContent('+ Wind');
        expect(rows[1]).toHaveTextContent('empty');
        expect(rows[1].querySelector('i.dot.st-empty')).not.toBeNull();
    });

    it('opens the pair of a clicked row', () => {
        const { onOpen } = setup();
        fireEvent.click(screen.getByRole('button', { name: /\+ Wind/ }));
        expect(onOpen).toHaveBeenCalledWith('1|3');
    });

    it('marks only the open row as sel', () => {
        const { container } = setup({ selectedKey: '1|3' });
        const sel = container.querySelectorAll('.walk-list button.sel');
        expect(sel).toHaveLength(1);
        expect(sel[0]).toHaveTextContent('+ Wind');
    });

    it('asks for at least two cards when the deck has fewer', () => {
        setup({ cards: [CARDS[0]] });
        expect(screen.getByText('Add at least two cards below to walk through their pairs.')).toBeInTheDocument();
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    describe('axes and mode', () => {
        it('lists only visible keys: a mirrored pair appears once', () => {
            const cards = [
                { id: 1, name: 'Fire', onX: true, onY: true },
                { id: 2, name: 'Ice', onX: true, onY: false },
                { id: 3, name: 'Wind', onX: false, onY: true },
            ];
            const { container } = setup({ cards });
            const rows = container.querySelectorAll('ol.walk-list li button');
            expect(rows).toHaveLength(2);
            expect(rows[0]).toHaveTextContent('+ Ice');
            expect(rows[1]).toHaveTextContent('+ Wind');
        });

        it('lists both orders in permutations, marking which card comes first', () => {
            const { container, onOpen } = setup({ mode: 'permutations', pairs: { '2|1': { state: 'done', name: 'Melt' } } });
            const rows = container.querySelectorAll('ol.walk-list li button');
            expect(Array.from(rows).map((r) => r.querySelector('.partner').textContent))
                .toEqual(['+ Ice', 'Ice +', '+ Wind', 'Wind +']);
            expect(rows[1]).toHaveTextContent('Melt');
            expect(rows[0]).toHaveTextContent('empty');
            fireEvent.click(rows[1]);
            expect(onOpen).toHaveBeenCalledWith('2|1');
        });

        it('offers cards on any axis in the picker, not cards on neither', () => {
            const cards = [
                { id: 1, name: 'Fire', onX: true, onY: false },
                { id: 2, name: 'Ice', onX: false, onY: true },
                { id: 3, name: 'Wind', onX: false, onY: false },
            ];
            setup({ cards });
            const select = screen.getByRole('combobox', { name: 'Card' });
            expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Fire', 'Ice']);
        });
    });
});
