import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import LivedDayTimeline from './LivedDayTimeline';

const moment = (id, startMinutes, durationMinutes, extra = {}) => ({
    id,
    date: '2026-10-31',
    startMinutes,
    durationMinutes,
    title: `M${id}`,
    category: 'work',
    detail: null,
    chatTicks: [],
    ...extra,
});

describe('LivedDayTimeline', () => {
    it('shows the empty text for a day with no moments', () => {
        render(<LivedDayTimeline moments={[]} onSelect={() => {}} />);

        expect(screen.getByText('Nothing lived here yet')).toBeInTheDocument();
    });

    it('renders one button per lane block, naming title and range', () => {
        render(<LivedDayTimeline moments={[moment(1, 480, 60), moment(2, 600, 90, { category: 'rest' })]} onSelect={() => {}} />);

        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'M1, 08:00-09:00' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'M2, 10:00-11:30' })).toBeInTheDocument();
    });

    it('draws drives as .lived-drive buttons, not blocks', () => {
        const { container } = render(
            <LivedDayTimeline moments={[moment(1, 480, 60), moment(2, 540, 30, { category: 'drive' })]} onSelect={() => {}} />
        );

        expect(container.querySelectorAll('.lived-drive')).toHaveLength(1);
        expect(container.querySelectorAll('.lived-block')).toHaveLength(1);
    });

    it('draws a tick per chat minute at its minute', () => {
        const { container } = render(
            <LivedDayTimeline moments={[moment(1, 480, 60, { chatTicks: [490, 520] })]} onSelect={() => {}} />
        );
        const ticks = container.querySelectorAll('.lived-tick');

        expect(ticks).toHaveLength(2);
        expect(ticks[0].style.top).not.toBe(ticks[1].style.top);
    });

    it('draws an hour rule per hour over the range', () => {
        const { container } = render(<LivedDayTimeline moments={[moment(1, 480, 60)]} onSelect={() => {}} />);

        expect(container.querySelectorAll('.lived-rule')).toHaveLength(19);
        expect(screen.getByText('06:00')).toBeInTheDocument();
    });

    it('shows no text under 20 minutes, title only when short, title and first detail line when tall', () => {
        render(
            <LivedDayTimeline
                moments={[
                    moment(1, 480, 10, { detail: 'a' }),
                    moment(2, 600, 30, { detail: 'second' }),
                    moment(3, 720, 120, { detail: 'first line\nsecond line' }),
                ]}
                onSelect={() => {}}
            />
        );

        expect(screen.getByRole('button', { name: /^M1/ })).toHaveTextContent('');
        expect(screen.getByRole('button', { name: /^M2/ })).toHaveTextContent('M2');
        expect(screen.getByRole('button', { name: /^M2/ })).not.toHaveTextContent('second');
        expect(screen.getByRole('button', { name: /^M3/ })).toHaveTextContent('M3first line');
        expect(screen.getByRole('button', { name: /^M3/ })).not.toHaveTextContent('second line');
    });

    it('calls onSelect with the original moment for a block and a drive', () => {
        const onSelect = jest.fn();
        const block = moment(1, 480, 60);
        const drive = moment(2, 600, 30, { category: 'drive', title: 'Drive home' });
        render(<LivedDayTimeline moments={[block, drive]} onSelect={onSelect} />);

        fireEvent.click(screen.getByRole('button', { name: /^M1/ }));
        fireEvent.click(screen.getByRole('button', { name: /^Drive home/ }));

        expect(onSelect).toHaveBeenNthCalledWith(1, block);
        expect(onSelect).toHaveBeenNthCalledWith(2, drive);
    });

    it('keeps a covered moment as a tappable button', () => {
        render(<LivedDayTimeline moments={[moment(1, 480, 120), moment(2, 500, 10)]} onSelect={() => {}} />);

        expect(screen.getByRole('button', { name: 'M2, 08:20-08:30' })).toBeInTheDocument();
    });
});
