import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

export function RouteError() {
  const err = useRouteError()
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : (err as Error)?.message ?? 'Unknown error'
  // A failed lazy-chunk load usually means a new version was deployed: offer a reload.
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-md p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-warn" aria-hidden />
        <h1 className="text-lg font-bold">Something went wrong</h1>
        <p className="mt-1 break-words text-sm text-muted">{msg}</p>
        <p className="mt-2 text-xs text-muted">Your data is stored locally and has not been lost.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn btn-soft h-10 px-4 text-sm" onClick={() => location.reload()}>Reload</button>
          <a className="btn btn-3d h-10 px-4 text-sm" href="/">Go to dashboard</a>
        </div>
      </div>
    </div>
  )
}
