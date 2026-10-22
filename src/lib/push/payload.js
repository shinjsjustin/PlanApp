'use strict';

// Below the 4079-byte record limit to leave room for push-service limits.
const MAX_PAYLOAD_BYTES = 3000;
const ELLIPSIS = '…';

const jsonBytes = (payload) => Buffer.byteLength(JSON.stringify(payload));

// Longest code-point prefix of `text` plus an ellipsis whose payload still fits.
// Returns just the ellipsis when no prefix fits.
const shorten = (payload, field) => {
    const chars = Array.from(payload[field]);
    const build = (n) => ({ ...payload, [field]: chars.slice(0, n).join('') + ELLIPSIS });
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (jsonBytes(build(mid)) <= MAX_PAYLOAD_BYTES) lo = mid;
        else hi = mid - 1;
    }
    return build(lo);
};

const fitPayload = (payload) => {
    if (jsonBytes(payload) <= MAX_PAYLOAD_BYTES) return payload;
    const shortBody = shorten(payload, 'body');
    if (jsonBytes(shortBody) <= MAX_PAYLOAD_BYTES) return shortBody;
    return shorten(shortBody, 'title');
};

module.exports = { fitPayload, MAX_PAYLOAD_BYTES };
