// Today's date key and current slot, refreshed by one timeout per slot
// boundary (never a per-second interval) so "now" markers stay current.
import { useEffect, useState } from 'react';
import { todayKey } from '../lib/dates';
import { slotStartMinutes, msUntilNextSlot } from '../lib/nowSlot';

const readNow = () => ({ today: todayKey(), slotMinutes: slotStartMinutes() });

const useCurrentSlot = () => {
    const [current, setCurrent] = useState(readNow);

    useEffect(() => {
        let timer;
        const schedule = () => {
            timer = setTimeout(() => {
                setCurrent(readNow());
                schedule();
            }, msUntilNextSlot());
        };
        schedule();

        return () => clearTimeout(timer);
    }, []);

    return current;
};

export default useCurrentSlot;
