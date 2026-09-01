// The single fetch wrapper for the whole app (spec section 5).
//
// Every call goes through here so there is one place that knows about the JWT,
// the `{ success, data, error }` envelope, and what a failure looks like.
// Callers receive the unwrapped `data` or an `ApiError` — never a raw Response,
// and never a silently swallowed problem.
//
// The auth endpoints are deliberately NOT called through this wrapper: they are
// still on the template's bare JSON shape and have no envelope to unwrap.

const BASE_URL = process.env.REACT_APP_URL;

export const TOKEN_KEY = 'token';

const NETWORK_ERROR_STATUS = 0;
const UNAUTHORIZED = 401;

const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';
const UNREADABLE_RESPONSE_MESSAGE = 'The server sent an unexpected response.';

/** A failed request. `status` is the HTTP status, or 0 when the request never landed. */
export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * A rejected token is not recoverable in place: drop it and send the user back
 * to the login screen. The caller still gets an ApiError so its own cleanup —
 * rolling back an optimistic change, say — still runs.
 */
const endSession = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.assign('/login');
};

const buildHeaders = (hasBody) => {
    const token = window.localStorage.getItem(TOKEN_KEY);

    return {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

/**
 * Reads the envelope. A body that is not JSON at all — an HTML error page from a
 * proxy, say — is reported as a failure rather than crashing the caller.
 */
const readEnvelope = async (response) => {
    try {
        return await response.json();
    } catch (cause) {
        throw new ApiError(UNREADABLE_RESPONSE_MESSAGE, response.status);
    }
};

const request = async (path, { method = 'GET', body } = {}) => {
    const hasBody = body !== undefined;

    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: buildHeaders(hasBody),
            ...(hasBody ? { body: JSON.stringify(body) } : {}),
        });
    } catch (cause) {
        throw new ApiError(NETWORK_ERROR_MESSAGE, NETWORK_ERROR_STATUS);
    }

    if (response.status === UNAUTHORIZED) {
        endSession();
        throw new ApiError(SESSION_EXPIRED_MESSAGE, UNAUTHORIZED);
    }

    const envelope = await readEnvelope(response);

    if (!response.ok || envelope.success === false) {
        throw new ApiError(envelope.error || UNREADABLE_RESPONSE_MESSAGE, response.status);
    }

    return envelope.data;
};

export const api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    // PUT replaces something outright rather than patching fields —
    // `/todos/:id/move` replaces a to-do's whole placement: list and position.
    put: (path, body) => request(path, { method: 'PUT', body }),
    delete: (path) => request(path, { method: 'DELETE' }),
};
