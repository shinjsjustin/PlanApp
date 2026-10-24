import { render, screen, fireEvent, within } from '@testing-library/react';

import AxisTray from './AxisTray';

const CARDS = [
    { id: 1, name: 'Both', onX: true, onY: true },
    { id: 2, name: 'OnlyX', onX: true, onY: false },
    { id: 3, name: 'OnlyY', onX: false, onY: true },
    { id: 4, name: 'Loose', onX: false, onY: false },
    { id: 5, name: 'Unflagged' },
];

const setup = (props = {}) => {
    const setCardAxes = jest.fn().mockResolvedValue({});
    const setMode = jest.fn().mockResolvedValue({});
    render(<AxisTray cards={CARDS} mode="combinations" setCardAxes={setCardAxes} setMode={setMode} {...props} />);
    return { setCardAxes, setMode };
};

const row = (name) => within(screen.getByRole('group', { name }));

describe('AxisTray', () => {
    it('lists cards under X, Y and Tray by their flags, a missing flag counting as on', () => {
        setup();
        expect(row('X').getAllByRole('listitem').map((li) => li.textContent.replace('×', ''))).toEqual(['Both', 'OnlyX', 'Unflagged']);
        expect(row('Y').getAllByRole('listitem').map((li) => li.textContent.replace('×', ''))).toEqual(['Both', 'OnlyY', 'Unflagged']);
        expect(row('Tray').getAllByRole('listitem')).toHaveLength(1);
        expect(row('Tray').getByText('Loose')).toBeInTheDocument();
    });

    it.each([
        ['X', { onX: true, onY: false }],
        ['Y', { onX: false, onY: true }],
        ['Both', { onX: true, onY: true }],
    ])('tray chip %s button sets the axes', (label, axes) => {
        const { setCardAxes } = setup();
        fireEvent.click(row('Tray').getByRole('button', { name: `Loose: ${label}` }));
        expect(setCardAxes).toHaveBeenCalledWith(4, axes);
    });

    it('the x on an X chip removes it from X only', () => {
        const { setCardAxes } = setup();
        fireEvent.click(row('X').getByRole('button', { name: 'Remove Both from X' }));
        expect(setCardAxes).toHaveBeenCalledWith(1, { onX: false, onY: true });
    });

    it('the x on a Y chip removes it from Y only', () => {
        const { setCardAxes } = setup();
        fireEvent.click(row('Y').getByRole('button', { name: 'Remove OnlyY from Y' }));
        expect(setCardAxes).toHaveBeenCalledWith(3, { onX: false, onY: false });
    });

    it('marks the current mode pressed and calls setMode for the other one', () => {
        const { setMode } = setup({ mode: 'permutations' });
        expect(screen.getByRole('button', { name: 'Permutations' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Combinations' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(screen.getByRole('button', { name: 'Combinations' }));
        expect(setMode).toHaveBeenCalledWith('combinations');
    });

    it('does not throw when a call is rejected', async () => {
        const { setCardAxes, setMode } = setup();
        setCardAxes.mockRejectedValue(new Error('no'));
        setMode.mockRejectedValue(new Error('no'));
        fireEvent.click(row('Tray').getByRole('button', { name: 'Loose: X' }));
        fireEvent.click(screen.getByRole('button', { name: 'Permutations' }));
        await Promise.resolve();
        expect(setCardAxes).toHaveBeenCalled();
    });
});
