import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, '..', 'Styling', 'TabBar.css'), 'utf8');

it('gives .tab-bar-back its own compact rule that does not flex-grow', () => {
    const match = /(?:^|\})\s*\.tab-bar-back\s*\{([^}]*)\}/.exec(css);

    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/flex:\s*0\s+0\s+auto\s*;/);
    expect(match[1]).toMatch(/padding:[^;]*var\(--space-/);
});
