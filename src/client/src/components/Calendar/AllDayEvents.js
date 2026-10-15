import React from 'react';

import '../Styling/Calendar.css';

/** One chip per all-day Google event, for a column or phone header. */
const AllDayEvents = ({ events }) => {
    const allDay = events.filter((event) => event.allDay);
    if (allDay.length === 0) return null;

    return (
        <ul className="all-day-events" aria-label="All-day Google events">
            {allDay.map((event) => (
                <li key={event.id} className="all-day-event">
                    {event.title}
                </li>
            ))}
        </ul>
    );
};

export default AllDayEvents;
