import { escapeHtml } from '@/lib/html'
/** Minimal, safe Markdown ⇄ HTML conversion for document import/export. Input text is always HTML-escaped. */

function inline(md: string) {
  let s = escapeHtml(md)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>').replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  // Only http(s)/mailto links are kept.
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2">$1</a>')
  return s
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []
  let code: string[] | null = null
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] } }
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  for (const line of lines) {
    if (code) {
      if (/^```/.test(line)) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null }
      else code.push(line)
      continue
    }
    if (/^```/.test(line)) { flushPara(); closeList(); code = []; continue }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { flushPara(); closeList(); const lvl = Math.min(h[1].length, 3); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); closeList(); out.push('<hr>'); continue }
    const bq = line.match(/^>\s?(.*)$/)
    if (bq) { flushPara(); closeList(); out.push(`<blockquote><p>${inline(bq[1])}</p></blockquote>`); continue }
    const task = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/i)
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (task || ul || ol) {
      flushPara()
      const kind = ol && !ul ? 'ol' : 'ul'
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind }
      const text = task ? `${task[1].toLowerCase() === 'x' ? '☑' : '☐'} ${task[2]}` : (ul ?? ol)![1]
      out.push(`<li><p>${inline(text)}</p></li>`)
      continue
    }
    if (!line.trim()) { flushPara(); closeList(); continue }
    closeList()
    para.push(line.trim())
  }
  if (code) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  flushPara(); closeList()
  return out.join('')
}

/** HTML (TipTap output) → Markdown using the DOM. */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const walk = (n: Node, ctx: { list?: 'ul' | 'ol'; idx?: number } = {}): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? ''
    if (!(n instanceof HTMLElement)) return ''
    const kids = (c = ctx) => Array.from(n.childNodes).map((k) => walk(k, c)).join('')
    switch (n.tagName.toLowerCase()) {
      case 'h1': return `# ${kids()}\n\n`
      case 'h2': return `## ${kids()}\n\n`
      case 'h3': return `### ${kids()}\n\n`
      case 'p': return ctx.list ? kids() : `${kids()}\n\n`
      case 'strong': case 'b': return `**${kids()}**`
      case 'em': case 'i': return `*${kids()}*`
      case 's': return `~~${kids()}~~`
      case 'code': return n.parentElement?.tagName === 'PRE' ? kids() : `\`${kids()}\``
      case 'pre': return `\`\`\`\n${n.textContent}\n\`\`\`\n\n`
      case 'blockquote': return kids().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n'
      case 'a': return `[${kids()}](${n.getAttribute('href') ?? ''})`
      case 'hr': return '---\n\n'
      case 'br': return '\n'
      case 'ul': case 'ol': {
        let i = 0
        return Array.from(n.children).map((li) => `${n.tagName === 'OL' ? `${++i}.` : '-'} ${walk(li, { list: n.tagName === 'OL' ? 'ol' : 'ul' }).trim()}`).join('\n') + '\n\n'
      }
      case 'li': return kids()
      default: return kids()
    }
  }
  return walk(doc.body.firstChild!).replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export const htmlToText = (html: string) => {
  const d = new DOMParser().parseFromString(html.replace(/<\/(p|h[1-6]|li|blockquote|pre)>/g, '</$1>\n'), 'text/html')
  return (d.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** Standalone printable HTML document (used for PDF via the browser print dialog and Word .doc export). */
export function standaloneHtml(title: string, bodyHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.6;color:#111}h1,h2,h3{line-height:1.25}pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto}blockquote{border-left:3px solid #ccc;margin:0;padding-left:12px;color:#444}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>
</head><body><h1>${escapeHtml(title)}</h1>${bodyHtml}</body></html>`
}

/** Open the browser print dialog for the given HTML (user can choose "Save as PDF"). */
export function printHtml(title: string, bodyHtml: string) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open(); doc.write(standaloneHtml(title, bodyHtml)); doc.close()
  let printed = false
  const go = () => {
    if (printed) return
    printed = true
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => iframe.remove(), 1000)
  }
  iframe.onload = go
  // Some browsers don't fire onload after document.write.
  setTimeout(go, 400)
}
