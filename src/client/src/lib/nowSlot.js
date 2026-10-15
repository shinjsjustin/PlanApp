// Which SLOT_MINUTES block the local clock is in, and how long until it ends,
// so today's column can mark "now" and move on at each boundary.
import { SLOT_MINUTES } from './schedule';

const MS_PER_MINUTE = 60 * 1000;
const SLOT_MS = SLOT_MINUTES * MS_PER_MINUTE;

const msSinceMidnight = (now) =>
    now - new Date(now.getFullYear(), now.getMonth(), now.getDate());

export const slotStartMinutes = (now = new Date()) =>
    Math.floor(msSinceMidnight(now) / SLOT_MS) * SLOT_MINUTES;

export const msUntilNextSlot = (now = new Date()) =>
    SLOT_MS - (msSinceMidnight(now) % SLOT_MS);
