export const $ = id => document.getElementById(id);

export function parseStored(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function makeChatId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const message = error?.message || error?.error?.message || error?.toString?.();
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
}

export function isRateLimitError(error) {
  const text = getErrorMessage(error, '').toLowerCase();
  return error?.status === 429 || error?.code === 429 || text.includes('rate limit') || text.includes('too many requests') || text.includes('429');
}
