import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'ProjectPhone.css'), 'utf8');
const body = /(?:^|\})\s*\.phone-todo-text\s*\{([^}]*)\}/.exec(css)[1];

it('sizes .phone-todo-text from --font-md instead of inheriting a heading size', () => {
    expect(body).toMatch(/font-size:\s*var\(--font-md\)/);
    expect(body).not.toMatch(/font:\s*inherit/);
});

it('keeps the .phone-todo-text font family inherited', () => {
    expect(body).toMatch(/font-family:\s*inherit/);
});
