import React from 'react';
import { Link } from 'react-router-dom';

// Unlike ThoughtsLink this shows on phones too: the tab bar only reaches the
// global Thoughts page, not a project's own.
export default function ProjectThoughtsLink({ projectId }) {
    return <Link className="neon-button" to={`/projects/${projectId}/thoughts`}>Project thoughts</Link>;
}
