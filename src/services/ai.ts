import { supabase } from './supabase'

/**
 * Optional AI layer. Requests go to the `ai` Supabase Edge Function, which holds the Anthropic API key
 * server-side and requires a signed-in user. Nothing here ever writes to user data: callers show the
 * result and the user decides whether to insert/apply it.
 */
export type AiTask = 'summarize' | 'improve' | 'organize' | 'breakdown' | 'plan' | 'interpret' | 'tags'

export const AI_TASKS: { id: AiTask; label: string; hint: string }[] = [
  { id: 'summarize', label: 'Summarize', hint: 'Concise summary of the text' },
  { id: 'improve', label: 'Improve writing', hint: 'Clearer wording, same meaning' },
  { id: 'organize', label: 'Organize notes', hint: 'Group into headed sections' },
  { id: 'breakdown', label: 'Break down task', hint: 'Actionable subtasks' },
  { id: 'plan', label: 'Project plan', hint: 'Phases, milestones, tasks' },
  { id: 'interpret', label: 'Interpret data', hint: 'Trends and insights from a table' },
  { id: 'tags', label: 'Suggest tags', hint: 'Up to 8 short tags' },
]

export class AiUnavailableError extends Error {}

export async function runAi(task: AiTask, input: string): Promise<string> {
  const sb = supabase()
  if (!sb) throw new AiUnavailableError('AI is not configured: connect Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) and deploy the `ai` edge function with an ANTHROPIC_API_KEY secret.')
  const { data: { session } } = await sb.auth.getSession()
  if (!session) throw new AiUnavailableError('Sign in to use AI features.')
  if (!input.trim()) throw new Error('There is no content to send.')
  if (input.length > 60_000) throw new Error('Content is too long for one request (60,000 characters max). Select a smaller part.')
  const { data, error } = await sb.functions.invoke('ai', { body: { task, input } })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404) throw new AiUnavailableError('The `ai` edge function is not deployed.')
    if (status === 503) throw new AiUnavailableError('AI is not configured on the server (missing ANTHROPIC_API_KEY).')
    if (status === 429) throw new Error('AI rate limit reached. Try again shortly.')
    throw new Error('AI request failed. Please try again.')
  }
  const out = (data as { text?: string; error?: string })
  if (out.error) throw new Error(out.error)
  return out.text ?? ''
}

/** Parse a "- item" / "1. item" list returned by the model into strings. */
export const parseList = (text: string) =>
  text.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
