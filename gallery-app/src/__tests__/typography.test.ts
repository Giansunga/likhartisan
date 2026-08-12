/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readProjectFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)));

describe('self-hosted typography system', () => {
  it('uses local Newsreader and Source Sans 3 faces without remote font providers', () => {
    const stylesheet = readProjectFile('../index.css').toString('utf8');
    const document = readProjectFile('../../index.html').toString('utf8');

    expect(stylesheet).toContain("font-family: 'Newsreader'");
    expect(stylesheet).toContain("font-family: 'Source Sans 3'");
    expect(stylesheet).toContain("--type-size-page-title");
    expect(stylesheet).toContain("--type-size-ui-compact");
    expect(`${stylesheet}\n${document}`).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  });

  it.each([
    'newsreader-latin-variable.woff2',
    'newsreader-latin-variable-italic.woff2',
    'source-sans-3-latin-variable.woff2',
    'source-sans-3-latin-variable-italic.woff2',
  ])('ships a valid WOFF2 file for %s', (filename) => {
    const font = readProjectFile(`../../public/fonts/${filename}`);

    expect(font.subarray(0, 4).toString('ascii')).toBe('wOF2');
  });

  it('provides responsive, content-safe hero typography variants', () => {
    const stylesheet = readProjectFile('../index.css').toString('utf8');

    expect(stylesheet).toContain('.system-hero-title--display');
    expect(stylesheet).toContain('.system-hero-title--banner');
    expect(stylesheet).toContain('.system-hero-title--editorial');
    expect(stylesheet).toContain('.system-hero-title--profile');
    expect(stylesheet).toMatch(/\.gallery-header-banner\s*\{[^}]*min-height:\s*0;[^}]*padding:\s*16px 0 24px/s);
    expect(stylesheet).toMatch(/\.gallery-header-banner\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*padding:\s*12px 0 20px/s);
  });
});
