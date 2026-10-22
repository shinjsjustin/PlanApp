import { act, render, screen, fireEvent } from '@testing-library/react';

import PairPanel from './PairPanel';

const CARD_A = { id: 1, name: 'Fire', detail: 'hot' };
const CARD_B = { id: 2, name: 'Ice', detail: '' };
const PAIR = { name: 'Steam', effect: 'Mist', notes: 'n', state: 'drafted' };
const AUTOSAVE_MS = 800;

const setup = (overrides = {}) => {
    const props = {
        cardA: CARD_A,
        cardB: CARD_B,
        pair: PAIR,
        savePair: jest.fn().mockResolvedValue({}),
        onClose: jest.fn(),
        ...overrides,
    };
    return { props, ...render(<PairPanel {...props} />) };
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('PairPanel', () => {
    it('shows the heading and only the details that exist', () => {
        setup();
        expect(screen.getByRole('heading', { name: 'Fire + Ice' })).toBeInTheDocument();
        expect(screen.getByText('hot')).toBeInTheDocument();
        expect(screen.queryByText(/Ice:/)).toBeNull();
    });

    it('fills the fields and presses the current state', () => {
        setup();
        expect(screen.getByLabelText('Name')).toHaveValue('Steam');
        expect(screen.getByLabelText('Effect')).toHaveValue('Mist');
        expect(screen.getByLabelText('Notes')).toHaveValue('n');
        ['empty', 'drafted', 'done', 'struck'].forEach((state) => {
            expect(screen.getByRole('button', { name: state }))
                .toHaveAttribute('aria-pressed', String(state === 'drafted'));
        });
    });

    it('autosaves typed fields after the delay with the card ids', async () => {
        const { props } = setup();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fog' } });
        expect(props.savePair).not.toHaveBeenCalled();
        await act(async () => { jest.advanceTimersByTime(AUTOSAVE_MS); });
        expect(props.savePair).toHaveBeenCalledTimes(1);
        expect(props.savePair).toHaveBeenCalledWith(
            { cardAId: 1, cardBId: 2, name: 'Fog', effect: 'Mist', notes: 'n', state: 'drafted' },
        );
    });

    it('saves a state button at once and presses it', async () => {
        const { props } = setup();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'done' })); });
        expect(props.savePair).toHaveBeenCalledWith(expect.objectContaining({ state: 'done' }));
        expect(screen.getByRole('button', { name: 'done' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'drafted' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('says Saved as you type. when saved', () => {
        setup();
        expect(screen.getByText('Saved as you type.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('says Not saved with Retry on error, and retry saves again', async () => {
        const savePair = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({});
        setup({ savePair });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'done' })); });
        expect(screen.getByText('Not saved')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
        expect(savePair).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Saved as you type.')).toBeInTheDocument();
    });

    it('calls onClose from Close', () => {
        const { props } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });
});
