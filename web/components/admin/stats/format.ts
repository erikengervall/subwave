// Number formatting shared by the Stats tabs. Every formatter renders an absent
// value as an em dash, so a cell never shows "0" for "not measured".

export const fmtInt = (n: number | null | undefined): string =>
  n == null ? '—' : Number(n).toLocaleString('en-GB');

export const fmtMs = (n: number | null | undefined): string => {
  if (n == null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
};

export const fmtPct = (n: number | null | undefined): string =>
  n == null ? '—' : `${Math.round(n * 100)}%`;

export const fmtTokens = (n: number | null | undefined): string => {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
};

// One-decimal mean; counts are small integers.
export const fmtAvg = (n: number | null | undefined): string =>
  n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-GB');

export const fmtBytes = (n: number | null | undefined): string => {
  if (n == null) return '—';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

// The window line every in-memory card carries, so each card says what it covers.
export const SINCE_START = 'since the controller started';
