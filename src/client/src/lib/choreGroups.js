export const lastDoneLabel = (chore) => (
    chore.lastDone ? `Last done ${chore.lastDone.on} by ${chore.lastDone.by}` : 'Never done'
);
