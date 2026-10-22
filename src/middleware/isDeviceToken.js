'use strict';

const asyncRoute = require('../lib/asyncRoute');
const repo = require('../db/repositories/deviceTokensRepo');
const { HttpError } = require('../lib/httpError');
const { withConnection } = require('../db/unitOfWork');

/**
 * Authenticates a per-device token (see `deviceTokensRepo`) for Shortcuts. A
 * user's JWT is not a device token, so it is rejected like any unknown token.
 * Sets `req.device` and records the use. Mount it after `respond`.
 */
const isDeviceToken = asyncRoute(async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Device token is missing');

    const device = await withConnection(async (conn) => {
        const row = await repo.findByToken(conn, token);
        if (row) await repo.touch(conn, row.id);

        return row;
    });
    if (!device) throw new HttpError(401, 'Device token is invalid');

    req.device = { id: device.id, ownerId: device.owner_id };
    next();
});

module.exports = isDeviceToken;
