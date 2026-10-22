import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'Calendar.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
);

const reminderRules = [...css.matchAll(/(?:^|\})\s*([^{}]*\.calendar-reminder[^{}]*)\{([^}]*)\}/g)];

it('defines .calendar-reminder rules in the same lane as events', () => {
    const body = reminderRules.find(([, selector]) => selector.trim() === '.calendar-reminder')?.[2];

    expect(body).toMatch(/position:\s*absolute\s*;/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere\s*;/);
    expect(body).toMatch(/border-left:[^;]*var\(--/);
});

it('uses only var(--...) tokens for colours in .calendar-reminder rules', () => {
    expect(reminderRules.length).toBeGreaterThan(0);
    reminderRules.forEach(([, , body]) => {
        expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(body).not.toMatch(/rgba?\(/i);
    });
});
