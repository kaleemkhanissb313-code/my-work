import { FileBarChart } from 'lucide-react'
import { buildReport, REPORTS } from '@/features/glamiex/reports'
import { ExportButtons, RangeBar, useRange } from '@/features/glamiex/ui'
import { useGx } from '../context'
import { earliestDate } from './shared'

export default function Reports() {
  const { data, tz } = useGx()
  const { state, setState, range: raw } = useRange('reports', tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const period = `${range.from} to ${range.to}`
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} />
      <p className="mb-4 text-sm text-muted">Every export includes the reporting period, currency (PKR) and generation time. Excel files keep amounts as numbers (in rupees) so you can total them. “PDF / Print” opens your browser's print dialog — choose “Save as PDF”.</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <li key={r.key} className="card flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised text-accent"><FileBarChart className="h-5 w-5" aria-hidden /></span>
              <div><h3 className="font-semibold">{r.name}</h3><p className="text-sm text-muted">{r.desc}</p></div></div>
            <div className="mt-auto"><ExportButtons name={r.name} period={period} sheets={() => buildReport(r.key, data, range, tz)} /></div>
          </li>
        ))}
      </ul>
    </div>
  )
}
