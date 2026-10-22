import { act, render, screen } from '@testing-library/react';

import Toast from './Toast';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('Toast', () => {
    it('shows the message in a status region', () => {
        render(<Toast message="Saved" onClear={jest.fn()} />);
        expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });

    it('calls onClear only after its timeout', () => {
        const onClear = jest.fn();
        render(<Toast message="Saved" onClear={onClear} />);
        act(() => { jest.advanceTimersByTime(3199); });
        expect(onClear).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(1); });
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('renders nothing and sets no timer for an empty message', () => {
        const onClear = jest.fn();
        const { container } = render(<Toast message="" onClear={onClear} />);
        expect(container).toBeEmptyDOMElement();
        act(() => { jest.advanceTimersByTime(10000); });
        expect(onClear).not.toHaveBeenCalled();
    });
});
