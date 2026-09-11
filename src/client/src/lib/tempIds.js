// Ids for entities that exist optimistically but not yet on the server.
//
// They are negative because MySQL auto-increment ids never are, so an
// unreconciled entity can never be confused with a stored one — and a stale
// reference to one is a lookup miss rather than a wrong row.
//
// One counter for the whole app rather than one per page. Two pages never share
// a state tree, so a per-page counter would be correct too; a single source is
// simply the one that makes "is this id real?" answerable without knowing which
// page is asking. The calendar needs exactly that: a day created by an overflow
// is drawn immediately and only afterwards told apart from a stored one, when
// the request that saves it has to name it by index rather than by id.

let lastTempId = 0;

export const createTempId = () => {
    lastTempId -= 1;

    return lastTempId;
};

export const isTempId = (id) => id < 0;
