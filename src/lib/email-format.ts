/** Mise en forme des emails, sans dépendance (testable). */

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Sépare « Objet : … » (première ligne) du corps du message. */
export function splitSubject(text: string, fallbackSubject: string): { subject: string; body: string } {
  const [first = '', ...rest] = text.split(/\r?\n/);
  const match = first.match(/^\s*objet\s*:\s*(.+)$/i);
  if (!match?.[1]) return { subject: fallbackSubject, body: text.trim() };
  return { subject: match[1].trim(), body: rest.join('\n').trim() };
}

/**
 * Texte brut → HTML simple : tout est échappé, les liens https deviennent
 * cliquables, les lignes « * » deviennent des puces.
 */
export function textToEmailHtml(text: string, header: string): string {
  const linkify = (s: string) => s.replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#2d55c8">${url}</a>`);
  const blocks = text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((l) => escape(l.trim()));
      if (lines.every((l) => l.startsWith('* '))) {
        return `<ul style="margin:0 0 14px;padding-left:20px">${lines.map((l) => `<li>${linkify(l.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p style="margin:0 0 14px">${lines.map(linkify).join('<br>')}</p>`;
    })
    .join('');
  return `<div style="background:#f3f5f8;padding:32px 16px;font-family:Segoe UI,Arial,sans-serif;color:#1b2232">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe0e8;border-radius:10px;padding:28px;font-size:15px;line-height:1.55">
<p style="margin:0 0 16px;font-size:13px;color:#5a6478">${escape(header)}</p>${blocks}</div></div>`;
}
