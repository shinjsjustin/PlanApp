import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import usePlaces from '../../hooks/usePlaces';
import useDeviceTokens from './useDeviceTokens';
import '../Styling/Shortcuts.css';

const REVOKE_MESSAGE = 'Revoke this device? Its Shortcuts will stop working.';

const formatLastUsed = (lastUsedAt) =>
    lastUsedAt ? `Last used ${new Date(lastUsedAt).toLocaleString()}` : 'Never used';

const ShortcutsPage = () => {
    const { tokens, error: tokensError, create, revoke } = useDeviceTokens();
    const { places, error: placesError } = usePlaces();
    const [name, setName] = useState('');
    const [newToken, setNewToken] = useState(null);
    const [placeId, setPlaceId] = useState('');
    const [copyFailed, setCopyFailed] = useState(false);

    const baseUrl = process.env.REACT_APP_URL;

    const handleCreate = async (event) => {
        event.preventDefault();
        const token = await create(name.trim());
        if (!token) return;
        setNewToken(token);
        setCopyFailed(false);
        setName('');
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(newToken);
            setCopyFailed(false);
        } catch (err) {
            setCopyFailed(true);
        }
    };

    const handleRevoke = (id) => {
        if (window.confirm(REVOKE_MESSAGE)) revoke(id);
    };

    return (
        <main className="shortcuts-page">
            <header className="shortcuts-header">
                <h1>Shortcuts</h1>
                <Link className="neon-button" to="/reminders">Reminders</Link>
            </header>

            {tokensError && <p role="alert" className="shortcuts-error">{tokensError}</p>}
            {placesError && <p role="alert" className="shortcuts-error">{placesError}</p>}
            {copyFailed && <p role="alert" className="shortcuts-error">Could not copy. Select the token and copy it by hand.</p>}

            <section className="shortcuts-section">
                <h2>Your devices</h2>
                <ul className="shortcuts-token-list">
                    {tokens.map((token) => (
                        <li key={token.id} className="shortcuts-token">
                            <span className="shortcuts-token-name">{token.name}</span>
                            <span className="shortcuts-token-used">{formatLastUsed(token.lastUsedAt)}</span>
                            <button type="button" className="neon-button" onClick={() => handleRevoke(token.id)}>
                                Revoke
                            </button>
                        </li>
                    ))}
                </ul>
                <form className="shortcuts-form" onSubmit={handleCreate}>
                    <label>
                        Device name
                        <input
                            type="text"
                            className="place-input"
                            value={name}
                            maxLength={100}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                    <button type="submit" className="neon-button" disabled={!name.trim()}>Create token</button>
                </form>
                {newToken && (
                    <div className="shortcuts-new-token">
                        <p>Copy this token now. It will not be shown again.</p>
                        <code>{newToken}</code>
                        <button type="button" className="neon-button" onClick={handleCopy}>Copy</button>
                    </div>
                )}
            </section>

            <section className="shortcuts-section">
                <h2>Your place links</h2>
                <label>
                    Place
                    <select className="place-input" value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
                        <option value="">Pick a place</option>
                        {places.map((place) => (
                            <option key={place.id} value={place.id}>{place.name}</option>
                        ))}
                    </select>
                </label>
                {placeId && (
                    <dl className="shortcuts-urls">
                        <dt>Arrive link</dt>
                        <dd><code>{`${baseUrl}/place-events/${placeId}/arrive`}</code></dd>
                        <dt>Leave link</dt>
                        <dd><code>{`${baseUrl}/place-events/${placeId}/leave`}</code></dd>
                    </dl>
                )}
            </section>

            <section className="shortcuts-section">
                <h2>Set it up on your iPhone</h2>
                <ol aria-label="Steps" className="shortcuts-steps">
                    <li>Create a token above for this phone and copy it.</li>
                    <li>Pick the place above and keep its Arrive link and Leave link handy.</li>
                    <li>Open the Shortcuts app, tap Automation, then New Automation, and choose Arrive (or Leave) and your place.</li>
                    <li>Choose Run Immediately, then add the action Get Contents of URL.</li>
                    <li>Paste the Arrive link (or the Leave link for a Leave automation) as the URL.</li>
                    <li>Tap Show More, set Method to POST.</li>
                    <li>Under Headers add a header named Authorization with the value Bearer followed by a space and your token.</li>
                    <li>Save. Repeat with the Leave link for a Leave automation.</li>
                </ol>
            </section>
        </main>
    );
};

export default ShortcutsPage;
