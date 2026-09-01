'use strict';

const { z } = require('zod');

const { successEnvelope, errorEnvelope, errorHandler } = require('../../src/middleware/respond');
const { HttpError, badRequest, forbidden, notFound } = require('../../src/lib/httpError');

/** Minimal Express `res` double: records the status and the JSON body it was sent. */
const fakeResponse = () => {
    const sent = { status: null, body: null };

    return {
        sent,
        status(code) {
            sent.status = code;
            return this;
        },
        json(body) {
            sent.body = body;
            return this;
        },
    };
};

const fakeRequest = () => ({ method: 'POST', originalUrl: '/api/projects', user: { id: 7 } });

const handle = (err) => {
    const res = fakeResponse();
    errorHandler(err, fakeRequest(), res, () => {
        throw new Error('errorHandler must not delegate to next()');
    });

    return res.sent;
};

describe('envelope builders', () => {
    test('wraps a payload as a success envelope', () => {
        expect(successEnvelope({ id: 1 })).toEqual({
            success: true,
            data: { id: 1 },
            error: null,
        });
    });

    test('wraps a message as an error envelope with no data', () => {
        expect(errorEnvelope('Nope')).toEqual({ success: false, data: null, error: 'Nope' });
    });
});

describe('errorHandler', () => {
    let consoleError;

    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    test.each([
        ['badRequest', badRequest('title is required'), 400, 'title is required'],
        ['forbidden', forbidden(), 403, /permission/i],
        ['notFound', notFound('Project'), 404, /project/i],
    ])('sends a %s as its own status and message', (_name, err, status, message) => {
        const sent = handle(err);

        expect(sent.status).toBe(status);
        expect(sent.body).toMatchObject({ success: false, data: null });
        expect(sent.body.error).toEqual(expect.stringMatching(message));
    });

    test('turns a zod failure into a 400 naming the offending field', () => {
        const schema = z.object({ title: z.string().min(1) });
        const result = schema.safeParse({ title: '' });

        const sent = handle(result.error);

        expect(sent.status).toBe(400);
        expect(sent.body.error).toMatch(/title/);
    });

    test('turns an unexpected error into a generic 500 that leaks nothing', () => {
        const sent = handle(new Error('ER_PARSE_ERROR near SELECT secret FROM users'));

        expect(sent.status).toBe(500);
        expect(sent.body.error).toBe('Something went wrong. Please try again.');
        expect(sent.body.error).not.toMatch(/SELECT/);
    });

    test('logs the full context of an unexpected error server-side', () => {
        handle(new Error('boom'));

        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('POST /api/projects'),
            expect.any(Error)
        );
    });

    test('does not log an expected client error as a server fault', () => {
        handle(new HttpError(404, 'Project not found'));

        expect(consoleError).not.toHaveBeenCalled();
    });
});
