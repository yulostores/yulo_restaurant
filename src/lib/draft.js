// Auto-saved drafts of the restaurant registration forms, kept in this browser so a refresh,
// a closed tab or a detour to another page never loses what the owner typed. Server state is
// untouched — the owner still submits / saves for real. Storage can be unavailable (private
// windows, blocked site data), so every access is guarded and a missing draft is normal.

const PREFIX = "yulo:restaurant-draft:";

export function loadDraft(key) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ ...value, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to clear */
  }
}
