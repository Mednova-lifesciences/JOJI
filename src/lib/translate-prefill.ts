/** Tiny cross-module handoff: Maternal Health can pre-fill the Translate composer. */
const KEY = "joji.translate.prefill";

export function setTranslatePrefill(text: string) {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    /* storage unavailable */
  }
}

export function takeTranslatePrefill(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
