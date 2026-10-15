'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `google_accounts` — one linked Google account per user.
 * Tokens are stored as the ciphertext the caller hands in; this repo never
 * encrypts or decrypts.
 */

const findByUser = async (conn, userId) => {
    const [rows] = await conn.execute(
        `SELECT user_id, google_email, refresh_token_enc, access_token_enc,
                access_expires_at, scopes
         FROM google_accounts WHERE user_id = ?`,
        [userId]
    );
    const row = firstRow(rows);
    if (!row) return null;

    return {
        userId: row.user_id,
        email: row.google_email,
        refreshTokenEnc: row.refresh_token_enc,
        accessTokenEnc: row.access_token_enc,
        // BIGINT can arrive as a string; epoch ms fits safely in a number.
        accessExpiresAt: Number(row.access_expires_at),
        scopes: row.scopes,
    };
};

const upsert = async (
    conn,
    { userId, email, refreshTokenEnc, accessTokenEnc, accessExpiresAt, scopes }
) => {
    await conn.execute(
        `INSERT INTO google_accounts
             (user_id, google_email, refresh_token_enc, access_token_enc, access_expires_at, scopes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
             google_email = VALUES(google_email),
             refresh_token_enc = VALUES(refresh_token_enc),
             access_token_enc = VALUES(access_token_enc),
             access_expires_at = VALUES(access_expires_at),
             scopes = VALUES(scopes)`,
        [userId, email, refreshTokenEnc, accessTokenEnc, accessExpiresAt, scopes]
    );
};

const updateAccessToken = async (conn, userId, { accessTokenEnc, accessExpiresAt }) => {
    await conn.execute(
        'UPDATE google_accounts SET access_token_enc = ?, access_expires_at = ? WHERE user_id = ?',
        [accessTokenEnc, accessExpiresAt, userId]
    );
};

const remove = async (conn, userId) => {
    const [result] = await conn.execute('DELETE FROM google_accounts WHERE user_id = ?', [userId]);

    return result.affectedRows > 0;
};

module.exports = { findByUser, remove, updateAccessToken, upsert };
