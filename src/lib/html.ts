const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapes text for safe use in HTML content and quoted attributes (print views, exports, generated documents). */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
