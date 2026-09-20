import { describe, it, expect } from 'vitest';
import { AA_LARGE, AA_TEXT, contrastRatio, parseHex, relativeLuminance } from './contrast';
import { ink, line, neutralTrace, status, surface } from '../constants/theme';

describe('contrast maths', () => {
  it('parses shorthand and full hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('#1a1a19')).toEqual([26, 26, 25]);
  });

  it('rejects malformed hex', () => {
    expect(() => parseHex('#12345')).toThrow(/Invalid hex/);
    expect(() => parseHex('nope')).toThrow(/Invalid hex/);
  });

  it('anchors luminance at the extremes', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#1a1a19', '#1a1a19')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#fab219', '#1a1a19')).toBeCloseTo(contrastRatio('#1a1a19', '#fab219'), 6);
  });
});

/**
 * The palette is held to WCAG AA mechanically. Text pairs must clear 4.5:1 and
 * graphical objects 3:1, on both the page plane and the panel surface.
 */
describe('palette accessibility', () => {
  const backgrounds = [surface.page, surface.panel, surface.raised];

  it.each(backgrounds)('primary ink clears AA text contrast on %s', (bg) => {
    expect(contrastRatio(ink.primary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(backgrounds)('secondary ink clears AA text contrast on %s', (bg) => {
    expect(contrastRatio(ink.secondary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(backgrounds)('muted ink clears AA text contrast on %s', (bg) => {
    expect(contrastRatio(ink.muted, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(backgrounds)('warning clears the graphical-object threshold on %s', (bg) => {
    expect(contrastRatio(status.warning, bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(backgrounds)('alarm clears the graphical-object threshold on %s', (bg) => {
    expect(contrastRatio(status.alarm, bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('keeps the neutral trace readable against the panel', () => {
    expect(contrastRatio(neutralTrace, surface.panel)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('alarm and warning text remain readable on all workspace surfaces', () => {
    for (const bg of backgrounds) {
      expect(contrastRatio(status.alarm, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(status.warning, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('keeps grid and axis lines from disappearing entirely', () => {
    expect(contrastRatio(line.grid, surface.panel)).toBeGreaterThan(1);
    expect(contrastRatio(line.axis, surface.panel)).toBeGreaterThan(1);
  });
});
