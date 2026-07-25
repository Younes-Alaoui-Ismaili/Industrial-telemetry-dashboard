import { describe, it, expect } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';
import { ink, line, status, surface } from './theme';

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
