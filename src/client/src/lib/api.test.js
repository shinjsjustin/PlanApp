import { ApiError, api, TOKEN_KEY } from './api';

const BASE_URL = process.env.REACT_APP_URL;

const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const success = (data) => jsonResponse(200, { success: true, data, error: null });

describe('api', () => {
    let originalLocation;

    beforeEach(() => {
        global.fetch = jest.fn();
        window.localStorage.clear();

        originalLocation = window.location;
        delete window.location;
        window.location = { assign: jest.fn() };
    });

    afterEach(() => {
        window.location = originalLocation;
        jest.resetAllMocks();
    });

    test('unwraps the envelope and returns only the data', async () => {
        // Arrange
        global.fetch.mockResolvedValue(success([{ id: 1, title: 'Build a drone' }]));

        // Act
        const result = await api.get('/projects');

        // Assert
        expect(result).toEqual([{ id: 1, title: 'Build a drone' }]);
        expect(global.fetch).toHaveBeenCalledWith(
            `${BASE_URL}/projects`,
            expect.objectContaining({ method: 'GET' })
        );
    });

    test('attaches the stored JWT as a bearer token', async () => {
        // Arrange
        window.localStorage.setItem(TOKEN_KEY, 'a.b.c');
        global.fetch.mockResolvedValue(success([]));

        // Act
        await api.get('/projects');

        // Assert
        const [, options] = global.fetch.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer a.b.c');
    });

    test('sends a JSON body on a write', async () => {
        // Arrange
        global.fetch.mockResolvedValue(jsonResponse(201, {
            success: true,
            data: { id: 9 },
            error: null,
        }));

        // Act
        const created = await api.post('/projects', { title: 'New' });

        // Assert
        const [, options] = global.fetch.mock.calls[0];
        expect(options.method).toBe('POST');
        expect(options.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(options.body)).toEqual({ title: 'New' });
        expect(created).toEqual({ id: 9 });
    });

    test('sends a PUT for a replacement, such as a to-do move', async () => {
        // Arrange
        global.fetch.mockResolvedValue(success({ id: 1001, sequenceId: null, position: 1 }));

        // Act
        const moved = await api.put('/todos/1001/move', { sequenceId: null, position: 1 });

        // Assert
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/todos/1001/move`);
        expect(options.method).toBe('PUT');
        expect(options.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(options.body)).toEqual({ sequenceId: null, position: 1 });
        expect(moved).toEqual({ id: 1001, sequenceId: null, position: 1 });
    });

    test('throws an ApiError carrying the server message and status', async () => {
        // Arrange
        global.fetch.mockResolvedValue(
            jsonResponse(400, { success: false, data: null, error: 'title is required' })
        );

        // Act + Assert
        await expect(api.post('/projects', {})).rejects.toMatchObject({
            name: 'ApiError',
            message: 'title is required',
            status: 400,
        });
    });

    test('clears the token and redirects to login on a 401', async () => {
        // Arrange
        window.localStorage.setItem(TOKEN_KEY, 'expired.token');
        global.fetch.mockResolvedValue(
            jsonResponse(401, { success: false, data: null, error: 'Token is INVALID' })
        );

        // Act + Assert
        await expect(api.get('/projects')).rejects.toBeInstanceOf(ApiError);
        expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
        expect(window.location.assign).toHaveBeenCalledWith('/login');
    });

    test('turns a network failure into an ApiError rather than a raw TypeError', async () => {
        // Arrange
        global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

        // Act + Assert
        await expect(api.get('/projects')).rejects.toMatchObject({
            name: 'ApiError',
            status: 0,
        });
    });

    test('turns an unparseable response into an ApiError', async () => {
        // Arrange
        global.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => {
                throw new SyntaxError('Unexpected token < in JSON');
            },
        });

        // Act + Assert
        await expect(api.get('/projects')).rejects.toMatchObject({
            name: 'ApiError',
            status: 500,
        });
    });
});
