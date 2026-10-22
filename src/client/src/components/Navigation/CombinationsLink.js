import React from 'react';
import { Link } from 'react-router-dom';

// Shows on phones too: there is no Combinations tab in the tab bar.
export default function CombinationsLink({ projectId }) {
    const to = projectId ? `/combinations?project=${projectId}` : '/combinations';
    return <Link className="neon-button" to={to}>Combinations</Link>;
}
