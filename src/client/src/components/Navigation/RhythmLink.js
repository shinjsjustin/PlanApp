import React from 'react';
import { Link } from 'react-router-dom';

// Shown on phones too: the tab bar has no Rhythm tab.
export default function RhythmLink() {
    return <Link className="neon-button" to="/rhythm">Rhythm</Link>;
}
