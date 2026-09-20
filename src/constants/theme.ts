/** Light industrial workspace, mirrored in Tailwind and first paint. */
export const surface = {
  page: '#edf2f7',
  panel: '#ffffff',
  raised: '#e5ecf3',
} as const;

export const ink = {
  primary: '#18324b',
  secondary: '#344e65',
  muted: '#526578',
} as const;

export const line = {
  grid: '#d6e0e9',
  axis: '#a6b6c5',
} as const;

/** Reserved for abnormal states only. Never used as series colours. */
export const status = {
  warning: '#925600',
  alarm: '#b92727',
} as const;

/** Trace colour for a healthy signal: neutral, so it recedes. */
export const neutralTrace = '#526578';

export const palette = { surface, ink, line, status, neutralTrace } as const;
