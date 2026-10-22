'use strict';

// Static pages the visual suite visits. `open` is the name of a button to click
// before the screenshot, for forms that start closed. Project pages depend on
// the user's projects and are built in routes.spec.js.
const ROUTES = [
    { name: 'home signed out', path: '/', signedIn: false },
    { name: 'home signed in', path: '/', signedIn: true },
    { name: 'login', path: '/login', signedIn: false },
    { name: 'projects', path: '/projects', signedIn: true },
    { name: 'calendar', path: '/calendar', signedIn: true },
    { name: 'thoughts', path: '/thoughts', signedIn: true },
    { name: 'reminders', path: '/reminders', signedIn: true },
    { name: 'reminders new form', path: '/reminders', signedIn: true, open: 'New reminder' },
    { name: 'reminders edit form', path: '/reminders', signedIn: true, open: 'Edit' },
    { name: 'address book', path: '/address-book', signedIn: true },
    { name: 'address book add person form', path: '/address-book', signedIn: true, open: 'Add person' },
    { name: 'address book add place form', path: '/address-book', signedIn: true, open: 'Add place' },
];

module.exports = { ROUTES };
