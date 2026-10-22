import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SnoozeDialog from './SnoozeDialog';

const NOW = new Date(2026, 9, 22, 14, 30, 0);

const renderDialog = () => {
    const onSnooze = jest.fn();
    const onCancel = jest.fn();
    render(<SnoozeDialog now={NOW} onSnooze={onSnooze} onCancel={onCancel} />);
    return { onSnooze, onCancel };
};

describe('SnoozeDialog', () => {
    test('1 hour sends the instant one hour after now', async () => {
        const { onSnooze } = renderDialog();
        await userEvent.click(screen.getByRole('button', { name: '1 hour' }));
        expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 9, 22, 15, 30, 0).toISOString());
    });

    test('tomorrow 9:00 sends nine o clock local time on the next day', async () => {
        const { onSnooze } = renderDialog();
        await userEvent.click(screen.getByRole('button', { name: 'Tomorrow 9:00' }));
        expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 9, 23, 9, 0, 0).toISOString());
    });

    test('a custom future time is sent as an ISO instant', () => {
        const { onSnooze } = renderDialog();
        fireEvent.change(screen.getByLabelText('Custom time'), { target: { value: '2026-10-25T08:15' } });
        fireEvent.click(screen.getByRole('button', { name: 'Snooze until custom time' }));
        expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 9, 25, 8, 15, 0).toISOString());
    });

    test('a custom time in the past is refused with a message', () => {
        const { onSnooze } = renderDialog();
        fireEvent.change(screen.getByLabelText('Custom time'), { target: { value: '2026-10-22T09:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Snooze until custom time' }));
        expect(onSnooze).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Pick a time in the future.');
    });

    test('an empty custom time is refused', () => {
        const { onSnooze } = renderDialog();
        fireEvent.click(screen.getByRole('button', { name: 'Snooze until custom time' }));
        expect(onSnooze).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    test('Cancel closes without snoozing', async () => {
        const { onSnooze, onCancel } = renderDialog();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalled();
        expect(onSnooze).not.toHaveBeenCalled();
    });
});
