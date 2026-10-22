'use strict';

const { request: playwrightRequest } = require('@playwright/test');
const { createUser, deleteUserByEmail } = require('../e2e/database');
const { dataOf, todayTitle } = require('../e2e/helpers');
const { apiUrl } = require('./session');

const VISUAL_USER = {
    name: 'Visual Tester',
    email: 'visual@example.test',
    password: 'visual-password-1234',
};

const LONG_LAYER_NAME = 'Structural analysis and load testing of the main rotor assembly';
const AT_TEN = 600;
const ONE_HOUR = 60;
const AT_TWO_PM = 840;
const AT_HALF_PAST_TWO = 870;
const DUE_AT_THREE_PM = '15:00';
const LONG_REMINDER_TITLE =
    'Collect the signed customs paperwork and confirm the rotor assembly shipment with the front desk';

const pad = (value) => String(value).padStart(2, '0');

/** Today as YYYY-MM-DD in local time, like the seed's other "today" values. */
const localToday = (now = new Date()) =>
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/**
 * Recreates the visual user in the test database and fills it, through the API,
 * with data that exercises the awkward layouts. Returns the user's token.
 */
const seedLocal = async () => {
    await deleteUserByEmail(VISUAL_USER.email);
    await createUser(VISUAL_USER);

    const api = await playwrightRequest.newContext({ baseURL: `${apiUrl()}/` });

    try {
        const login = await (
            await api.post('auth/login', {
                data: { email: VISUAL_USER.email, password: VISUAL_USER.password },
            })
        ).json();

        if (!login.token) throw new Error('Seeding failed: no token for the visual user');

        const headers = {
            Authorization: `Bearer ${login.token}`,
            'X-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        const send = async (method, url, data) => dataOf(await api[method](url, { headers, data }));

        // Grey project: a title and nothing else.
        await send('post', 'projects', { title: 'Empty grey project' });

        const project = await send('post', 'projects', {
            title: 'Western Digital rotor build',
            description: 'A realistic project with dated work and open to-dos.',
        });
        const graph = await send('get', `projects/${project.id}`);
        const layerId = graph.layers[0].id;

        await send('patch', `layers/${layerId}`, { title: LONG_LAYER_NAME });

        const sequence = await send('post', `layers/${layerId}/sequences`, {});
        await send('patch', `sequences/${sequence.id}`, { title: todayTitle() });

        const filed = await send('post', `projects/${project.id}/todos`, {
            text: 'Pack the order',
            sequenceId: sequence.id,
        });
        await send('post', `projects/${project.id}/todos`, {
            text: 'Call the customer about delivery',
            sequenceId: sequence.id,
        });
        await send('post', `projects/${project.id}/todos`, { text: 'Loose unorganized to-do' });

        const day = await send('post', 'calendar/days', {});
        await send('post', 'calendar/notes', {
            dayId: day.id, text: 'Last chance to deliver to Western Digital',
            startMinutes: AT_TWO_PM, durationMinutes: ONE_HOUR,
        });
        await send('post', 'calendar/notes', {
            dayId: day.id, text: 'Overlapping reminder about the parts order',
            startMinutes: AT_HALF_PAST_TWO, durationMinutes: ONE_HOUR,
        });
        await send('put', 'calendar/items', {
            placements: [{ todoId: filed.id, dayId: day.id, startMinutes: AT_TEN, durationMinutes: ONE_HOUR }],
        });

        const headOffice = await send('post', 'places', {
            name: 'Head office', address: '1 Main St, Springfield', kind: 'client',
        });
        const subcategory = await send('post', 'reminder-subcategories', {
            placeId: headOffice.id, name: 'Front desk',
        });
        const today = localToday();
        await send('post', 'reminders', {
            title: LONG_REMINDER_TITLE,
            placeId: headOffice.id,
            subcategoryId: subcategory.id,
            dueDate: today,
            dueTime: DUE_AT_THREE_PM,
            priority: 'high',
        });
        await send('post', 'reminders', { title: `Date only: ${LONG_REMINDER_TITLE}`, dueDate: today });
        await send('post', 'reminders', { title: `No place: ${LONG_REMINDER_TITLE}` });
        await send('post', 'people', {
            name: 'Ada Lovelace',
            company: 'Analytical Engines Ltd',
            phones: [{ label: 'mobile', number: '+1 555 0100' }],
        });
        await send('post', 'people', {
            name: 'Grace Hopper',
            phones: [{ label: 'office', number: '(555) 010-0199' }, { label: '', number: '5550100' }],
        });

        return login.token;
    } finally {
        await api.dispose();
    }
};

module.exports = { seedLocal };
