import { createContext, useContext } from 'react';

import { PX_PER_SLOT_MIN, createDayGeometry } from '../lib/scheduleGeometry';

// The scale, published to everything that draws a day.
//
// A context rather than a prop, because the consumers are leaves: every booking
// card and every note ribbon converts minutes to pixels, and threading a
// geometry through `DayStrip` → `DayColumn` → `DayGrid` → each card would touch
// every component in between for a value none of them use.
//
// The default is a geometry at the floor rather than `null`, so a component
// rendered bare in a test draws at the scale the calendar has always drawn at
// instead of throwing. That matches how `DayColumn` already treats `droppable`
// and `cardFor` as optional: outside its wrapper, a column is still a column.

const DayScaleContext = createContext(createDayGeometry(PX_PER_SLOT_MIN));

export const DayScaleProvider = DayScaleContext.Provider;

/** The geometry bound to the current scale: `minutesToPx`, `pxToMinutes`, `dayHeightPx`. */
export const useDayGeometry = () => useContext(DayScaleContext);

export default DayScaleContext;
