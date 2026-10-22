import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PushButton from './PushButton';
import { pushSupport, turnOnPush } from '../../pwa/push';

jest.mock('../../pwa/push');

describe('PushButton', () => {
    test('offers to turn notifications on when push is off', async () => {
        pushSupport.mockResolvedValue('off');
        render(<PushButton />);
        expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
    });

    test('says notifications are on and offers no button', async () => {
        pushSupport.mockResolvedValue('on');
        render(<PushButton />);
        expect(await screen.findByText('Notifications on')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test.each(['unsupported', 'denied'])('shows the Home Screen hint when %s', async (state) => {
        pushSupport.mockResolvedValue(state);
        render(<PushButton />);
        expect(await screen.findByText(/Home Screen/)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('clicking calls turnOnPush and switches to on', async () => {
        pushSupport.mockResolvedValue('off');
        turnOnPush.mockResolvedValue('on');
        render(<PushButton />);
        await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
        expect(turnOnPush).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Notifications on')).toBeInTheDocument();
    });

    test('shows the hint when permission ends up denied', async () => {
        pushSupport.mockResolvedValue('off');
        turnOnPush.mockResolvedValue('denied');
        render(<PushButton />);
        await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
        expect(await screen.findByText(/Home Screen/)).toBeInTheDocument();
    });

    test('shows an alert and keeps the button when turning on fails', async () => {
        pushSupport.mockResolvedValue('off');
        turnOnPush.mockRejectedValue(new Error('boom'));
        render(<PushButton />);
        await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not turn on notifications');
        expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
    });
});
