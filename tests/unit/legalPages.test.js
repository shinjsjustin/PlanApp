const fs = require('fs');
const path = require('path');
const { renderPage } = require('../../src/legal/render');
const { LAST_UPDATED } = require('../../src/legal/lastUpdated');

const EMAIL = 'shinjsjustin@gmail.com';

const decode = (html) =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const HEADINGS = {
  about: ['ShinPlan'],
  privacy: [
    'Privacy Policy', 'What we collect', 'How we use Google user data',
    'Storage and security', 'Your choices', 'Children', 'Changes', 'Contact',
  ],
  terms: [
    'Terms of Service', 'The service', 'Your account', 'Google services',
    'Acceptable use', 'No warranty', 'Limitation of liability', 'Ending use',
    'Changes', 'Governing law', 'Contact',
  ],
};

describe('renderPage', () => {
  test('LAST_UPDATED is 20 October 2026', () => {
    expect(LAST_UPDATED).toBe('20 October 2026');
  });

  test.each(Object.keys(HEADINGS))('%s is a full document with styles and nav', (name) => {
    const html = renderPage(name);
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('<title>');
    expect(html).toContain('href="/legal/tokens.css"');
    expect(html).toContain('href="/legal/legal.css"');
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  test.each(Object.entries(HEADINGS))('%s contains every draft heading', (name, headings) => {
    const html = renderPage(name);
    headings.forEach((h) => expect(html).toMatch(new RegExp(`<h[12]>${h}</h[12]>`)));
  });

  test.each(['privacy', 'terms'])('%s shows contact email and last updated date', (name) => {
    const text = decode(renderPage(name));
    expect(text).toContain(EMAIL);
    expect(text).toContain(`Last updated: ${LAST_UPDATED}`);
    expect(text).not.toContain('[contact email]');
    expect(text).not.toContain('[date of deploy]');
  });

  test('privacy lists no username and states account details', () => {
    const text = decode(renderPage('privacy'));
    expect(text).not.toMatch(/username/i);
    expect(text).toContain('your name, email address and a hashed password');
  });

  test('privacy has the corrected Calendar sentences', () => {
    const text = decode(renderPage('privacy'));
    expect(text).toContain('when you import Google events');
    expect(text).toContain('the dated days in your ShinPlan calendar');
    expect(text).toContain("title, location, times and Google event ID");
    expect(text).toContain('creates, updates or deletes the events it made');
  });

  test('privacy has the corrected disconnect sentences', () => {
    const text = decode(renderPage('privacy'));
    expect(text).toContain("on ShinPlan's calendar page");
    expect(text).toContain("asks Google to revoke ShinPlan's access and deletes the stored tokens");
    expect(text).toContain(
      'imported event copies, the record of exported events and the events already in your Google Calendar stay until you delete them or ask us to delete your account',
    );
  });

  test('privacy AI assistant paragraph is verbatim from the draft', () => {
    const text = decode(renderPage('privacy'));
    expect(text).toContain(
      "AI assistant: Justin's personal AI assistant can read your ShinPlan data and the Google data described above through ShinPlan, to help plan your day. It runs on Anthropic's Claude service, which processes that data to answer your requests.",
    );
  });

  test('escapes HTML in text', () => {
    const html = renderPage('privacy');
    expect(html).toContain('ShinPlan (&quot;ShinPlan&quot;, &quot;we&quot;)');
  });

  test('unknown page throws', () => {
    expect(() => renderPage('nope')).toThrow();
  });
});

describe('legal.css', () => {
  test('uses only tokens defined in index.css', () => {
    const root = path.join(__dirname, '../..');
    const css = fs.readFileSync(path.join(root, 'src/legal/legal.css'), 'utf8');
    const index = fs.readFileSync(path.join(root, 'src/client/src/index.css'), 'utf8');
    const used = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    used.forEach((name) => expect(index).toMatch(new RegExp(`${name}\\s*:`)));
  });
});
