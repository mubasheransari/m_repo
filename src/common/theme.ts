/** Colour themes members can pick. A theme is a preset key, or a custom colour written as #RRGGBB. */
export const THEME_PRESETS = ['rose', 'ocean', 'emerald', 'violet', 'sunset', 'teal', 'crimson', 'mocha'] as const;

export const THEME_KEY_RE = /^(rose|ocean|emerald|violet|sunset|teal|crimson|mocha|#[0-9A-Fa-f]{6})$/;

export const isValidThemeKey = (v: unknown): v is string => typeof v === 'string' && THEME_KEY_RE.test(v);

/** Stored in one form so the same colour is never saved two ways. */
export const normalizeThemeKey = (v: string): string => (v.startsWith('#') ? v.toUpperCase() : v);
