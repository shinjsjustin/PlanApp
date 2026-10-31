import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import LivedView from './LivedView';
import { api } from '../../lib/api';
import { dayLabel } from '../../lib/dates';

jest.mock('../../lib/api');

const moment = (id, date, title, extra = {}) => ({
    id, date, startMinutes: 480, durationMinutes: 60, title, category: 'work', detail: null, chatTicks: [], ...extra,
});

let moments;

const swipe = (target, fromX, toX) => {
    fireEvent.touchStart(target, { touches: [{ clientX: fromX, clientY: 100 }] });
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: toX, clientY: 100 }] });
};

beforeEach(() => {
    jest.clearAllMocks();
    moments = [moment(1, '2026-10-31', 'Standup'), moment(2, '2026-10-30', 'Planning')];
    api.get.mockImplementation(() => Promise.resolve({ moments }));
    // Saturday 2026-10-31 midday: the lived day is the 31st.
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'nextTick', 'setImmediate', 'clearImmediate'] })
        .setSystemTime(new Date(2026, 9, 31, 12, 0));
});

afterEach(() => jest.useRealTimers());

describe('LivedView', () => {
    it('opens on the lived today, fetching its week', async () => {
        render(<LivedView />);

        expect(await screen.findByRole('button', { name: 'Standup, 08:00-09:00' })).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith('/lived?from=2026-10-31&to=2026-11-06');
        expect(screen.getByRole('heading', { name: dayLabel('2026-10-31') })).toBeInTheDocument();
    });

    it('shows a legend of every category', async () => {
        const { container } = render(<LivedView />);
        await screen.findByText('Standup');

        const legend = container.querySelector('.lived-legend');
        ['God', 'Family', 'Work', 'Building', 'Rest', 'Sleep', 'Drive'].forEach((label) =>
            expect(legend).toHaveTextContent(label)
        );
    });

    it('shows a loading status until the answer arrives', async () => {
        render(<LivedView />);

        expect(screen.getByRole('status')).toHaveTextContent('Loading');
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    });

    it('shows the error with a Retry that refetches', async () => {
        api.get.mockRejectedValueOnce(new Error('boom'));
        render(<LivedView />);

        expect(await screen.findByRole('alert')).toHaveTextContent('boom');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        expect(await screen.findByRole('button', { name: 'Standup, 08:00-09:00' })).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('opens a week row day in the timeline', async () => {
        render(<LivedView />);
        await screen.findByText('Standup');

        fireEvent.click(screen.getByRole('button', { name: /^Sun/ }));

        expect(screen.getByRole('heading', { name: dayLabel('2026-11-01') })).toBeInTheDocument();
        expect(screen.getByText('Nothing lived here yet')).toBeInTheDocument();
    });

    it('steps a day with prev and next, refetching when the week changes', async () => {
        render(<LivedView />);
        await screen.findByText('Standup');

        fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));

        expect(screen.getByRole('heading', { name: dayLabel('2026-10-30') })).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/lived?from=2026-10-24&to=2026-10-30'));
        expect(await screen.findByRole('button', { name: 'Planning, 08:00-09:00' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Next day' }));

        expect(screen.getByRole('heading', { name: dayLabel('2026-10-31') })).toBeInTheDocument();
        await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/lived?from=2026-10-31&to=2026-11-06'));
    });

    it('does not refetch when staying inside the week', async () => {
        render(<LivedView />);
        await screen.findByText('Standup');

        fireEvent.click(screen.getByRole('button', { name: 'Next day' }));

        expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('swipes left to the next day and right to the previous one', async () => {
        const { container } = render(<LivedView />);
        await screen.findByText('Standup');
        const story = container.querySelector('.lived-story');

        swipe(story, 200, 50);
        expect(screen.getByRole('heading', { name: dayLabel('2026-11-01') })).toBeInTheDocument();

        swipe(story, 50, 200);
        swipe(story, 50, 200);
        expect(screen.getByRole('heading', { name: dayLabel('2026-10-30') })).toBeInTheDocument();
    });

    it('opens the sheet for a tapped block', async () => {
        render(<LivedView />);

        fireEvent.click(await screen.findByRole('button', { name: 'Standup, 08:00-09:00' }));

        expect(screen.getByRole('dialog', { name: 'Standup' })).toBeInTheDocument();
    });
});
