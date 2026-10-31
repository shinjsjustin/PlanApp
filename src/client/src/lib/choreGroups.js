const GROUPS = [
    { status: 'overdue', label: 'Overdue' },
    { status: 'due', label: 'Due now' },
    { status: 'upcoming', label: 'Coming up' },
    { status: 'never', label: 'Never done' },
];

/** Buckets chores by status without re-sorting: the server already orders them by urgency. */
export const groupChores = (chores) => GROUPS
    .map(({ status, label }) => ({ status, label, chores: chores.filter((chore) => chore.status === status) }))
    .filter((group) => group.chores.length > 0);

export const lastDoneLabel = (chore) => (
    chore.lastDone ? `Last done ${chore.lastDone.on} by ${chore.lastDone.by}` : 'Never done'
);
