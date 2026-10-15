import React from 'react';
import { Link } from 'react-router-dom';

import useIsPhone from '../../hooks/useIsPhone';

// Phones reach Thoughts through the tab bar, so only desktop headers show this.
export default function ThoughtsLink() {
    const isPhone = useIsPhone();
    if (isPhone) return null;
    return <Link className="neon-button" to="/thoughts">Thoughts</Link>;
}
