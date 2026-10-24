import { render, screen, fireEvent } from '@testing-library/react';

import GridView from './GridView';

const CARDS = [
    { id: 1, name: 'Fire' },
    { id: 2, name: 'Ice' },
    { id: 3, name: 'Wind' },
];
const PAIRS = {
    '1|2': { state: 'done', name: 'Steam' },
    '1|3': { state: 'drafted', name: 'A very long pair name' },
};

const setup = (overrides = {}) => {
    const onOpen = jest.fn();
    const utils = render(
        <GridView cards={CARDS} pairs={PAIRS} selectedKey={null} onOpen={onOpen} {...overrides} />,
    );
    return { onOpen, ...utils };
};

describe('GridView', () => {
    it('renders one state cell per pair above the diagonal, unsaved pairs as empty', () => {
        const { container } = setup();
        const cells = container.querySelectorAll('td.cell');
        expect(cells).toHaveLength(3);
        expect(container.querySelectorAll('td.cell.st-done')).toHaveLength(1);
        expect(container.querySelectorAll('td.cell.st-drafted')).toHaveLength(1);
        expect(container.querySelectorAll('td.cell.st-empty')).toHaveLength(1);
        expect(container.querySelectorAll('td.diag')).toHaveLength(3);
        expect(container.querySelectorAll('td.lower')).toHaveLength(3);
    });

    it('shows the pair name truncated to 12 characters, else the state symbol', () => {
        setup();
        expect(screen.getByText('Steam')).toBeInTheDocument();
        expect(screen.getByText('A very long…')).toBeInTheDocument();
        expect(screen.getByText('·')).toBeInTheDocument();
    });

    it('labels a cell with both cards, the state and the name', () => {
        setup();
        expect(screen.getByRole('button', { name: 'Fire + Ice: done · Steam' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ice + Wind: empty' })).toBeInTheDocument();
    });

    it('opens a pair on click, Enter and Space', () => {
        const { onOpen } = setup();
        const cell = screen.getByRole('button', { name: 'Fire + Ice: done · Steam' });
        fireEvent.click(cell);
        fireEvent.keyDown(cell, { key: 'Enter' });
        fireEvent.keyDown(cell, { key: ' ' });
        fireEvent.keyDown(cell, { key: 'a' });
        expect(onOpen.mock.calls).toEqual([['1|2'], ['1|2'], ['1|2']]);
    });

    it('marks only the selected cell with sel', () => {
        const { container } = setup({ selectedKey: '1|3' });
        const sel = container.querySelectorAll('td.sel');
        expect(sel).toHaveLength(1);
        expect(sel[0]).toHaveAttribute('aria-label', 'Fire + Wind: drafted · A very long pair name');
    });

    it('keys cells by sorted ids when deck order differs from id order', () => {
        const { onOpen } = setup({ cards: [CARDS[1], CARDS[0]], pairs: {} });
        fireEvent.click(screen.getByRole('button'));
        expect(onOpen).toHaveBeenCalledWith('1|2');
    });

    it('shows the placeholder under two cards', () => {
        const { container } = setup({ cards: [CARDS[0]] });
        expect(screen.getByText('Add at least two cards below to see their pairs.')).toBeInTheDocument();
        expect(container.querySelector('table')).toBeNull();
    });

    describe('axes and mode', () => {
        const AXIS_CARDS = [
            { id: 1, name: 'Fire', onX: true, onY: false },
            { id: 2, name: 'Ice', onX: true, onY: true },
            { id: 3, name: 'Wind', onX: false, onY: true },
        ];
        const headers = (container, selector) =>
            Array.from(container.querySelectorAll(selector)).map((h) => h.textContent);

        it('puts Y cards on rows and X cards on columns', () => {
            const { container } = setup({ cards: AXIS_CARDS, pairs: {} });
            expect(headers(container, 'thead th[scope="col"]')).toEqual(['Fire', 'Ice']);
            expect(headers(container, 'tbody th[scope="row"]')).toEqual(['Ice', 'Wind']);
            expect(container.querySelectorAll('td.diag')).toHaveLength(1);
            expect(container.querySelectorAll('td.cell')).toHaveLength(3);
        });

        it('renders a mirror as a muted lower cell that opens the live key', () => {
            const { container, onOpen } = setup({ pairs: { '1|2': { state: 'done', name: 'Steam' } } });
            const mirror = container.querySelector('tr:nth-child(2) td.lower.mirror');
            expect(mirror).toHaveClass('st-done');
            fireEvent.click(mirror);
            fireEvent.keyDown(mirror, { key: 'Enter' });
            expect(onOpen.mock.calls).toEqual([['1|2'], ['1|2']]);
            expect(container.querySelectorAll('td.lower.mirror')).toHaveLength(3);
        });

        it('makes every off-diagonal cell live in permutations, keyed row|col', () => {
            const { container, onOpen } = setup({
                mode: 'permutations',
                pairs: { '2|1': { state: 'done', name: 'Melt' } },
            });
            expect(container.querySelectorAll('td.cell')).toHaveLength(6);
            expect(container.querySelectorAll('td.lower')).toHaveLength(0);
            const cell = screen.getByRole('button', { name: 'Ice + Fire: done · Melt' });
            expect(cell).toHaveAttribute('title', 'Ice + Fire: done · Melt');
            fireEvent.click(cell);
            fireEvent.click(screen.getByRole('button', { name: 'Fire + Ice: empty' }));
            expect(onOpen.mock.calls).toEqual([['2|1'], ['1|2']]);
        });

        it.each([
            ['X', [{ id: 1, name: 'A', onX: false }, { id: 2, name: 'B', onX: false }]],
            ['Y', [{ id: 1, name: 'A', onY: false }, { id: 2, name: 'B', onY: false }]],
        ])('asks for cards on both axes when none are on %s', (_axis, cards) => {
            const { container } = setup({ cards });
            expect(screen.getByText('Add cards to both the X and Y axes to see their pairs.')).toBeInTheDocument();
            expect(container.querySelector('table')).toBeNull();
        });

        it('words the hint per mode', () => {
            const { unmount } = setup({ mode: 'permutations' });
            expect(screen.getByText(/row then column/)).toBeInTheDocument();
            unmount();
            setup();
            expect(screen.queryByText(/row then column/)).toBeNull();
        });
    });
});
