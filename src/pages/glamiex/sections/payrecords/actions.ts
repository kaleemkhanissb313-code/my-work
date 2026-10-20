import { downloadBlob } from '@/services/backup'
import { printHtml } from '@/lib/markdown'
import { escapeHtml } from '@/lib/html'
import { PR_METHODS, PR_STATUSES, formatAmount, longDate, time12, weekday, type PayRecord, type PrDraft } from '@/features/glamiex/payRecords/model'
import { PR_DISCLAIMER, recordBlob, recordFileName } from '@/features/glamiex/payRecords/render'

type Rec = PayRecord | PrDraft

export async function downloadRecord(r: Rec, ext: 'png' | 'jpg') {
  const blob = await recordBlob(r, ext === 'png' ? 'image/png' : 'image/jpeg')
  downloadBlob(blob, recordFileName(r, ext))
}

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b) })

/** Prints the rendered image followed by the record details. */
export async function printRecord(r: Rec) {
  const img = await toDataUrl(await recordBlob(r, 'image/png', 1.5))
  const row = (k: string, v: string) => (v.trim() ? `<tr><th style="text-align:left;padding:4px 12px 4px 0">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>` : '')
  printHtml(`Payment record · ${r.partnerName}`, `
    <img src="${img}" alt="" style="display:block;max-width:100%;max-height:80vh;margin:0 auto 16px" />
    <table>
      ${row('Partner', r.partnerName)}${row('Title', r.title)}${row('Amount', formatAmount(r.amount, r.currency))}
      ${row('Date', `${longDate(r.date)} (${weekday(r.date)})`)}${row('Time', time12(r.time))}
      ${row('Payment method', PR_METHODS.find((m) => m.id === r.method)?.label ?? '')}${row('Sender', r.sender)}${row('Receiver', r.receiver)}
      ${row('Purpose', r.purpose)}${row('Reference no.', r.reference)}${row('Status', PR_STATUSES.find((s) => s.id === r.status)?.label ?? r.status)}
      ${row('Location', r.location)}${row('Notes', r.notes)}
    </table>
    <p style="color:#666;margin-top:16px">${escapeHtml(PR_DISCLAIMER)}</p>`)
}
