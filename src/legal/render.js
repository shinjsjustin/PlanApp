const { pages } = require('./pages');

const NAV = [
  ['about', 'About'],
  ['privacy', 'Privacy'],
  ['terms', 'Terms'],
];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function renderBlock([tag, content]) {
  if (tag === 'ul') {
    return `<ul>${content.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
  return `<${tag}>${escapeHtml(content)}</${tag}>`;
}

function renderPage(name) {
  const page = Object.prototype.hasOwnProperty.call(pages, name) ? pages[name] : null;
  if (!page) throw new Error(`Unknown legal page: ${name}`);
  const nav = NAV.map(([key, label]) => `<a href="/${key}">${label}</a>`).join(' &middot; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} - ShinPlan</title>
<link rel="stylesheet" href="/legal/tokens.css">
<link rel="stylesheet" href="/legal/legal.css">
</head>
<body>
<main class="legal">
<nav class="legal-nav">${nav}</nav>
${page.blocks.map(renderBlock).join('\n')}
</main>
</body>
</html>
`;
}

module.exports = { renderPage };
