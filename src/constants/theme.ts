/**
 * Control room palette.
 *
 * Follows the high performance HMI convention: normal operation is rendered in
 * neutral, desaturated tones and colour is reserved for abnormal states. There is
 * deliberately no "healthy green" and no per-metric colour coding, because colour
 * spent on normal operation is colour that cannot signal an exception.
 *
 * Only two status hues exist, amber for warning and red for alarm. They were kept
 * far apart on purpose: measured separation between them is well clear of the
 * confusable range, whereas a green/red pairing is the classic failure case for
 * red-green colour vision deficiency. Dropping green removes that failure entirely.
 *
 * Every status hue clears 3:1 against the panel surface, which is the bar for
 * graphical objects. Alarm red does NOT clear 4.5:1, so it is never used for body
 * text: severity is written in normal ink next to a coloured mark and an icon, so
 * state is never carried by colour alone.
 *
 * These values are mirrored in tailwind.config.js. A test asserts the two agree,
 * so they cannot drift apart.
 */

export const surface = {
  page: '#0d0d0d',
  panel: '#1a1a19',
  raised: '#232322',
} as const;

export const ink = {
  primary: '#ffffff',
  secondary: '#c3c2b7',
  muted: '#8f8d86',
} as const;

export const line = {
  grid: '#2c2c2a',
  axis: '#383835',
} as const;

/** Reserved for abnormal states only. Never used as series colours. */
export const status = {
  warning: '#fab219',
  alarm: '#d03b3b',
} as const;

/** Trace colour for a healthy signal: neutral, so it recedes. */
export const neutralTrace = '#8f8d86';

export const palette = { surface, ink, line, status, neutralTrace } as const;
