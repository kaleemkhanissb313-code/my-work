/** Built-in starter templates. Static HTML that only uses nodes supported by the TipTap StarterKit schema. */
export interface BuiltinTemplate {
  id: string
  title: string
  description: string
  kind: 'document' | 'note'
  content: string
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-meeting-notes',
    title: 'Meeting notes',
    description: 'Agenda, attendees, discussion, decisions and action items.',
    kind: 'note',
    content:
      '<h1>Meeting notes</h1>' +
      '<p><strong>Date:</strong> </p><p><strong>Attendees:</strong> </p>' +
      '<h2>Agenda</h2><ol><li><p></p></li></ol>' +
      '<h2>Discussion</h2><p></p>' +
      '<h2>Decisions</h2><ul><li><p></p></li></ul>' +
      '<h2>Action items</h2><ul><li><p>Owner — task — due date</p></li></ul>',
  },
  {
    id: 'builtin-project-brief',
    title: 'Project brief',
    description: 'Goals, scope, stakeholders, timeline and risks.',
    kind: 'document',
    content:
      '<h1>Project brief</h1>' +
      '<h2>Overview</h2><p>What is this project and why does it matter?</p>' +
      '<h2>Goals</h2><ul><li><p></p></li></ul>' +
      '<h2>Scope</h2><h3>In scope</h3><ul><li><p></p></li></ul><h3>Out of scope</h3><ul><li><p></p></li></ul>' +
      '<h2>Stakeholders</h2><ul><li><p></p></li></ul>' +
      '<h2>Timeline &amp; milestones</h2><ol><li><p></p></li></ol>' +
      '<h2>Risks</h2><ul><li><p></p></li></ul>' +
      '<h2>Success criteria</h2><p></p>',
  },
  {
    id: 'builtin-weekly-review',
    title: 'Weekly review',
    description: 'Wins, lessons, open loops and next week priorities.',
    kind: 'note',
    content:
      '<h1>Weekly review</h1>' +
      '<h2>Wins this week</h2><ul><li><p></p></li></ul>' +
      '<h2>What did not go well</h2><ul><li><p></p></li></ul>' +
      '<h2>Lessons learned</h2><p></p>' +
      '<h2>Open loops</h2><ul><li><p></p></li></ul>' +
      '<h2>Top 3 priorities for next week</h2><ol><li><p></p></li><li><p></p></li><li><p></p></li></ol>',
  },
  {
    id: 'builtin-daily-journal',
    title: 'Daily journal',
    description: 'Gratitude, focus, notes and reflection for the day.',
    kind: 'note',
    content:
      '<h1>Daily journal</h1>' +
      '<h2>Grateful for</h2><ul><li><p></p></li></ul>' +
      '<h2>Today\'s focus</h2><p></p>' +
      '<h2>Notes</h2><p></p>' +
      '<h2>Reflection</h2><blockquote><p>What went well? What would I do differently?</p></blockquote>',
  },
  {
    id: 'builtin-bug-report',
    title: 'Bug report',
    description: 'Summary, steps to reproduce, expected vs actual, environment.',
    kind: 'document',
    content:
      '<h1>Bug report</h1>' +
      '<h2>Summary</h2><p></p>' +
      '<h2>Steps to reproduce</h2><ol><li><p></p></li></ol>' +
      '<h2>Expected result</h2><p></p>' +
      '<h2>Actual result</h2><p></p>' +
      '<h2>Environment</h2><ul><li><p>Browser / OS:</p></li><li><p>Version:</p></li></ul>' +
      '<h2>Logs / screenshots</h2><pre><code></code></pre>' +
      '<h2>Severity</h2><p></p>',
  },
]
