const DEFAULT_TIMEOUT_MS = 3000;

// Never rejects: callers must not be slowed or broken by a Bridge failure.
async function postToBridge(url, token, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) console.error(`postToBridge failed: status ${res.status}`);
        return { ok: res.ok, status: res.status };
    } catch (err) {
        console.error(`postToBridge failed: ${err && err.name}`);
        return { ok: false, status: null };
    }
}

module.exports = { postToBridge, DEFAULT_TIMEOUT_MS };
