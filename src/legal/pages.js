const { LAST_UPDATED } = require('./lastUpdated');

const CONTACT_EMAIL = 'shinjsjustin@gmail.com';

// Block shapes: ['h1'|'h2'|'p', text] or ['ul', [items]].
const pages = {
  about: {
    title: 'About ShinPlan',
    blocks: [
      ['h1', 'ShinPlan'],
      ['p', 'ShinPlan is a personal planner made by Justin Shin for his own use. It keeps his projects, to-do lists and a short calendar of the next few days in one place.'],
      ['p', 'If you connect a Google account, ShinPlan reads your Google Calendar so your events show next to your plans, can add the time blocks you plan in ShinPlan to your Google Calendar, and can look up files in your Google Drive that you ask it to read.'],
      ['p', 'ShinPlan is a private tool, not a public service: accounts are created by invitation only.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    blocks: [
      ['h1', 'Privacy Policy'],
      ['p', `Last updated: ${LAST_UPDATED}`],
      ['p', 'ShinPlan ("ShinPlan", "we") is a personal planner operated by Justin Shin, an individual, at www.shinplan.com. This policy explains what ShinPlan does with your information, including data from your Google account. ShinPlan is used privately by invitation only.'],
      ['h2', 'What we collect'],
      ['ul', [
        'Account details: your name, email address and a hashed password.',
        'What you put into ShinPlan: projects, to-do lists, calendar days, notes, and any contacts and places you add.',
        'If you connect Google: your Google email address, and access tokens that let ShinPlan act for you. The tokens are stored encrypted on our server and are never sent to your browser.',
      ]],
      ['h2', 'How we use Google user data'],
      ['ul', [
        "Google Calendar: when you import Google events, ShinPlan reads the events on your primary calendar for the dated days in your ShinPlan calendar, and saves each event's title, location, times and Google event ID so it can display them. When you export your plan, ShinPlan creates, updates or deletes the events it made for your planned time blocks in your Google Calendar, and keeps a record of which events it made.",
        'Google Drive (read-only): ShinPlan can list your files and read the text of a document, spreadsheet or text file when you or your assistant ask it to. It does not change or delete anything in your Drive, and it does not store file contents.',
        "Travel times: when you plan a trip between two places, the addresses are sent to Google's Routes service to estimate drive time.",
        "AI assistant: Justin's personal AI assistant can read your ShinPlan data and the Google data described above through ShinPlan, to help plan your day. It runs on Anthropic's Claude service, which processes that data to answer your requests.",
      ]],
      ['p', "We use Google user data only to provide these features to you. We do not sell it, use it for advertising, or use it to train AI models, and we do not share it with anyone except the service providers named above as needed to provide the features. ShinPlan's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements."],
      ['h2', 'Storage and security'],
      ['p', 'Your data is stored on our server. Google tokens are encrypted at rest. We take reasonable steps to protect your data, but no system is perfectly secure.'],
      ['h2', 'Your choices'],
      ['ul', [
        "You can disconnect Google at any time on ShinPlan's calendar page; this asks Google to revoke ShinPlan's access and deletes the stored tokens, but imported event copies, the record of exported events and the events already in your Google Calendar stay until you delete them or ask us to delete your account. You can also remove ShinPlan's access at myaccount.google.com/permissions.",
        'You can ask us to delete your account and data by contacting us.',
      ]],
      ['h2', 'Children'],
      ['p', 'ShinPlan is not directed to children under 13, and we do not knowingly collect their information.'],
      ['h2', 'Changes'],
      ['p', 'If we change this policy, we will update the date above and tell users before the change takes effect.'],
      ['h2', 'Contact'],
      ['p', CONTACT_EMAIL],
    ],
  },
  terms: {
    title: 'Terms of Service',
    blocks: [
      ['h1', 'Terms of Service'],
      ['p', `Last updated: ${LAST_UPDATED}`],
      ['p', 'These terms cover your use of ShinPlan at www.shinplan.com, operated by Justin Shin, an individual. By using ShinPlan you agree to them.'],
      ['h2', 'The service'],
      ['p', 'ShinPlan is a personal planner offered privately, by invitation, free of charge. It may change, pause or end at any time.'],
      ['h2', 'Your account'],
      ['p', 'Keep your login details private. You are responsible for what happens under your account. You keep ownership of everything you put into ShinPlan.'],
      ['h2', 'Google services'],
      ['p', "If you connect Google, your use of Google services is also governed by Google's own terms. Our Privacy Policy explains what ShinPlan does with your Google data."],
      ['h2', 'Acceptable use'],
      ['p', "Don't misuse ShinPlan: no attempts to break in, overload it, or use it for anything unlawful."],
      ['h2', 'No warranty'],
      ['p', 'ShinPlan is provided "as is" and "as available", without warranties of any kind, to the extent the law allows. Don\'t rely on it as your only copy of important information.'],
      ['h2', 'Limitation of liability'],
      ['p', 'To the extent the law allows, we are not liable for indirect or consequential losses, or for lost data, arising from your use of ShinPlan. Nothing in these terms limits liability for fraud, willful misconduct or anything else that cannot be limited under California law.'],
      ['h2', 'Ending use'],
      ['p', 'You can stop using ShinPlan at any time. We may suspend or close an account that misuses the service.'],
      ['h2', 'Changes'],
      ['p', 'If we change these terms, we will update the date above and tell users before the change takes effect.'],
      ['h2', 'Governing law'],
      ['p', 'These terms are governed by the laws of the State of California.'],
      ['h2', 'Contact'],
      ['p', CONTACT_EMAIL],
    ],
  },
};

module.exports = { pages };
