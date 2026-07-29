import { describe, it, expect } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';
// Read through Vite's ?raw import rather than node:fs, so the test needs neither
// Node type definitions nor a new dependency to state what index.html contains.
import indexHtml from '../../index.html?raw';
import { ink, line, palette, status, surface } from './theme';

/**
 * The palette exists twice: once as TypeScript constants for chart strokes, once
 * as Tailwind colours for class names. Duplication is deliberate (Tailwind config
 * cannot import a .ts module here), so this test makes drift impossible.
 */
describe('theme and tailwind config agree', () => {
  const hmi = (
    tailwindConfig as unknown as {
      theme: { extend: { colors: { hmi: Record<string, string> } } };
    }
  ).theme.extend.colors.hmi;

  it.each([
    ['page', surface.page],
    ['panel', surface.panel],
    ['raised', surface.raised],
    ['primary', ink.primary],
    ['secondary', ink.secondary],
    ['muted', ink.muted],
    ['grid', line.grid],
    ['axis', line.axis],
    ['warning', status.warning],
    ['alarm', status.alarm],
  ])('hmi-%s matches the theme constant', (name, expected) => {
    expect(hmi[name]).toBe(expected);
  });

  it('defines no extra colours that the theme does not know about', () => {
    expect(Object.keys(hmi).sort()).toEqual(
      ['alarm', 'axis', 'grid', 'muted', 'page', 'panel', 'primary', 'raised', 'secondary', 'warning'],
    );
  });
});

/**
 * The palette exists a third time, as literal hex inside index.html.
 *
 * That copy cannot be avoided: the boot shell paints before the CSS bundle
 * exists, so it has no class names to use. It can be kept honest, which is what
 * this does. Anything invented there would show up as a colour the shell uses
 * and the dashboard does not.
 */
describe('the boot shell paints in the dashboard palette', () => {
  const html = indexHtml;
  const known = new Set(
    [
      ...Object.values(palette.surface),
      ...Object.values(palette.ink),
      ...Object.values(palette.line),
      ...Object.values(palette.status),
      palette.neutralTrace,
    ].map((hex) => hex.toLowerCase()),
  );

  it('uses no colour the theme does not define', () => {
    const used = html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(used.length).toBeGreaterThan(0);
    for (const hex of used) expect(known).toContain(hex.toLowerCase());
  });

  it('paints the same page background the dashboard uses', () => {
    expect(html).toContain(`background: ${surface.page};`);
  });
});
