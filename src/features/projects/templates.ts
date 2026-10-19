import type { Area, Priority } from '@/types/models'

/**
 * Built-in project templates. Each task's `day` is an offset from the project start date (its due date);
 * tasks start on the previous task's due date in the same phase, so the Gantt view shows a realistic plan.
 */
export interface TemplateTask {
  day: number
  title: string
  phase: string
  priority?: Priority
  est?: number // minutes
  subtasks?: string[]
  milestone?: boolean
}

export interface ProjectTemplate {
  id: string
  name: string
  category: TemplateCategory
  icon: string
  color: string
  area: Area
  description: string
  durationDays: number
  tasks: TemplateTask[]
  /** Sections for the auto-created project brief document. */
  brief: string[]
}

export const TEMPLATE_CATEGORIES = ['SEO', 'Marketing', 'Design', 'Development', 'Content', 'Video', 'Sales', 'Events', 'Personal'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

const t = (day: number, phase: string, title: string, o: Partial<TemplateTask> = {}): TemplateTask => ({ day, phase, title, ...o })

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  /* ---------------- SEO ---------------- */
  {
    id: 'seo-audit', name: 'SEO audit & optimisation', category: 'SEO', icon: 'Search', color: '#10b981', area: 'work', durationDays: 42,
    description: 'Full technical, on-page and off-page SEO programme for a website, from audit to monthly reporting.',
    brief: ['Website & goals', 'Target audience & locations', 'Competitors', 'Primary keywords', 'KPIs (traffic, rankings, conversions)', 'Access needed (Search Console, Analytics, CMS)'],
    tasks: [
      t(1, 'Setup', 'Get access: Search Console, Analytics, CMS, hosting', { priority: 'high', subtasks: ['Google Search Console', 'Google Analytics 4', 'CMS admin', 'Hosting / DNS'] }),
      t(2, 'Setup', 'Record baseline metrics', { est: 60, subtasks: ['Organic sessions', 'Indexed pages', 'Top 20 keyword positions', 'Core Web Vitals'] }),
      t(5, 'Technical', 'Crawl site and log technical issues', { est: 180, priority: 'high', subtasks: ['Broken links & 404s', 'Redirect chains', 'Duplicate titles/meta', 'Canonical tags', 'Robots.txt & sitemap'] }),
      t(8, 'Technical', 'Page speed & Core Web Vitals fixes', { est: 240, subtasks: ['Compress images', 'Lazy-load media', 'Reduce JS/CSS', 'Caching'] }),
      t(10, 'Technical', 'Mobile usability & structured data', { est: 120, subtasks: ['Mobile tap targets', 'Schema: Organization / Article / Product', 'Validate in Rich Results Test'] }),
      t(12, 'Technical', 'Technical audit complete', { milestone: true }),
      t(15, 'Keywords', 'Keyword research & clustering', { est: 300, priority: 'high', subtasks: ['Seed keywords', 'Search volume & difficulty', 'Search intent', 'Group into topic clusters'] }),
      t(17, 'Keywords', 'Map keywords to pages', { est: 120 }),
      t(22, 'On-page', 'Optimise titles, meta descriptions and H1s', { est: 240 }),
      t(25, 'On-page', 'Improve internal linking', { est: 120 }),
      t(28, 'On-page', 'Refresh or expand thin content', { est: 360 }),
      t(30, 'On-page', 'On-page optimisation complete', { milestone: true }),
      t(34, 'Off-page', 'Competitor backlink gap analysis', { est: 180 }),
      t(38, 'Off-page', 'Outreach for guest posts & citations', { est: 300, subtasks: ['Build prospect list', 'Write outreach email', 'Follow up after 5 days'] }),
      t(40, 'Off-page', 'Google Business Profile optimisation', { est: 90 }),
      t(42, 'Reporting', 'Month-1 SEO report & next steps', { priority: 'high', milestone: true, subtasks: ['Traffic vs baseline', 'Ranking changes', 'Issues fixed', 'Next month plan'] }),
    ],
  },
  {
    id: 'seo-local', name: 'Local SEO setup', category: 'SEO', icon: 'Target', color: '#14b8a6', area: 'work', durationDays: 21,
    description: 'Get a local business into the map pack: profile, citations, reviews and location pages.',
    brief: ['Business name, address, phone (NAP)', 'Service areas', 'Main services', 'Competitors in the map pack', 'Review goals'],
    tasks: [
      t(1, 'Profile', 'Claim and verify Google Business Profile', { priority: 'high' }),
      t(3, 'Profile', 'Complete profile: categories, hours, services, photos', { est: 120, subtasks: ['Primary & secondary categories', 'Opening hours', 'Services with prices', '10+ photos'] }),
      t(6, 'Citations', 'Make NAP consistent everywhere', { est: 120 }),
      t(9, 'Citations', 'Submit to top local directories', { est: 180, subtasks: ['Bing Places', 'Apple Business Connect', 'Industry directories', 'Chamber of commerce'] }),
      t(12, 'Website', 'Create location / service-area pages', { est: 240 }),
      t(14, 'Website', 'Add LocalBusiness schema', { est: 60 }),
      t(17, 'Reviews', 'Set up review request process', { subtasks: ['Short review link', 'Email/SMS template', 'Reply to every review'] }),
      t(21, 'Reporting', 'Local rankings check & report', { milestone: true }),
    ],
  },
  /* ---------------- Marketing ---------------- */
  {
    id: 'mkt-launch', name: 'Product launch campaign', category: 'Marketing', icon: 'Rocket', color: '#f97316', area: 'work', durationDays: 35,
    description: 'Plan, build and run a multi-channel launch with pre-launch hype, launch day and follow-up.',
    brief: ['Product & key benefit', 'Target persona', 'Positioning statement', 'Launch date', 'Channels', 'Budget', 'Success metrics'],
    tasks: [
      t(2, 'Strategy', 'Define audience, positioning and key messages', { priority: 'high', est: 180 }),
      t(4, 'Strategy', 'Set goals, KPIs and budget', { est: 90 }),
      t(6, 'Strategy', 'Launch plan approved', { milestone: true }),
      t(10, 'Assets', 'Landing page copy and design', { priority: 'high', est: 480, subtasks: ['Headline & subhead', 'Benefits section', 'Social proof', 'CTA & sign-up form'] }),
      t(13, 'Assets', 'Launch video / demo', { est: 480 }),
      t(15, 'Assets', 'Email sequence (teaser, launch, follow-up)', { est: 240 }),
      t(17, 'Assets', 'Social media posts & graphics', { est: 300 }),
      t(19, 'Assets', 'Press kit & media list', { est: 180 }),
      t(22, 'Pre-launch', 'Waitlist / teaser campaign live', { milestone: true }),
      t(26, 'Pre-launch', 'Influencer & partner outreach', { est: 240 }),
      t(28, 'Launch', 'Launch day: publish everything', { priority: 'urgent', milestone: true, subtasks: ['Landing page live', 'Emails sent', 'Social posts', 'Community posts (Product Hunt, Reddit, groups)'] }),
      t(31, 'Follow-up', 'Respond to feedback and comments', { est: 120 }),
      t(35, 'Follow-up', 'Launch results report', { milestone: true, subtasks: ['Sign-ups / sales', 'Channel performance', 'Lessons learned'] }),
    ],
  },
  {
    id: 'mkt-social', name: 'Social media content calendar (monthly)', category: 'Marketing', icon: 'Megaphone', color: '#ec4899', area: 'work', durationDays: 30,
    description: 'Plan, create, schedule and analyse a month of social content across platforms.',
    brief: ['Platforms', 'Content pillars (3–5)', 'Posting frequency', 'Brand voice', 'Monthly goal (followers, reach, leads)'],
    tasks: [
      t(1, 'Plan', 'Review last month analytics', { est: 60 }),
      t(2, 'Plan', 'Choose themes, pillars and key dates', { est: 90 }),
      t(4, 'Plan', 'Write month content calendar', { est: 180, priority: 'high' }),
      t(8, 'Create', 'Write captions & hashtags (week 1–2)', { est: 180 }),
      t(10, 'Create', 'Design graphics & short videos (week 1–2)', { est: 360 }),
      t(12, 'Publish', 'Schedule weeks 1–2', { milestone: true }),
      t(18, 'Create', 'Create content for weeks 3–4', { est: 480 }),
      t(20, 'Publish', 'Schedule weeks 3–4', { milestone: true }),
      t(25, 'Engage', 'Community engagement & replies', { est: 120 }),
      t(30, 'Analyse', 'Monthly social report', { milestone: true, subtasks: ['Reach & impressions', 'Engagement rate', 'Top 3 posts', 'Next month ideas'] }),
    ],
  },
  {
    id: 'mkt-email', name: 'Email marketing sequence', category: 'Marketing', icon: 'Mail', color: '#3b82f6', area: 'work', durationDays: 21,
    description: 'Lead magnet, welcome/nurture sequence, automation and A/B testing.',
    brief: ['Audience segment', 'Lead magnet', 'Sequence goal', 'Email platform', 'Number of emails'],
    tasks: [
      t(2, 'Strategy', 'Define segment and sequence goal', { priority: 'high' }),
      t(5, 'Strategy', 'Create lead magnet', { est: 300 }),
      t(8, 'Write', 'Write emails 1–3 (welcome, value, story)', { est: 240 }),
      t(11, 'Write', 'Write emails 4–6 (proof, offer, last call)', { est: 240 }),
      t(13, 'Build', 'Build automation & sign-up forms', { est: 180, subtasks: ['Form on site', 'Tags / segments', 'Delays between emails'] }),
      t(15, 'Build', 'Test all emails on desktop & mobile', { est: 60 }),
      t(16, 'Launch', 'Sequence live', { milestone: true }),
      t(21, 'Optimise', 'A/B test subject lines & review metrics', { milestone: true }),
    ],
  },
  /* ---------------- Design ---------------- */
  {
    id: 'design-brand', name: 'Brand identity design', category: 'Design', icon: 'Palette', color: '#8b5cf6', area: 'work', durationDays: 28,
    description: 'Discovery to final brand guidelines: logo, colours, typography and assets.',
    brief: ['Brand name & story', 'Audience', 'Personality (3 adjectives)', 'Competitors', 'Deliverables', 'Feedback rounds'],
    tasks: [
      t(2, 'Discovery', 'Client questionnaire & kickoff call', { priority: 'high', est: 90 }),
      t(5, 'Discovery', 'Mood boards & competitor research', { est: 240 }),
      t(6, 'Discovery', 'Direction approved', { milestone: true }),
      t(10, 'Concepts', 'Logo sketches & 3 concepts', { est: 600, priority: 'high' }),
      t(12, 'Concepts', 'Present concepts', { milestone: true }),
      t(16, 'Refine', 'Refine chosen logo (round 1–2)', { est: 360 }),
      t(19, 'System', 'Colour palette & typography', { est: 240, subtasks: ['Primary/secondary colours', 'Accessible contrast check', 'Heading & body fonts'] }),
      t(22, 'System', 'Brand assets: social, business card, letterhead', { est: 360 }),
      t(26, 'Delivery', 'Brand guidelines PDF', { est: 300 }),
      t(28, 'Delivery', 'Final files handover', { milestone: true, subtasks: ['SVG / PNG / PDF', 'Light & dark versions', 'Favicon'] }),
    ],
  },
  {
    id: 'design-uiux', name: 'Website / app UI-UX design', category: 'Design', icon: 'PenTool', color: '#06b6d4', area: 'work', durationDays: 35,
    description: 'User research, flows, wireframes, high-fidelity UI, prototype, usability test and dev handoff.',
    brief: ['Product & users', 'Problems to solve', 'Key user flows', 'Platforms & breakpoints', 'Design system', 'Success metrics'],
    tasks: [
      t(3, 'Research', 'Stakeholder & user interviews', { priority: 'high', est: 360 }),
      t(5, 'Research', 'Personas & journey map', { est: 240 }),
      t(8, 'Structure', 'Information architecture & sitemap', { est: 180 }),
      t(11, 'Structure', 'User flows for key tasks', { est: 240 }),
      t(15, 'Wireframes', 'Low-fi wireframes', { est: 480 }),
      t(16, 'Wireframes', 'Wireframes approved', { milestone: true }),
      t(20, 'UI', 'Design system: colours, type, components', { est: 480, subtasks: ['Buttons & inputs', 'Cards & navigation', 'States: hover, focus, error, empty'] }),
      t(25, 'UI', 'High-fidelity screens (desktop + mobile)', { est: 900, priority: 'high' }),
      t(27, 'Prototype', 'Interactive prototype', { est: 240 }),
      t(30, 'Test', 'Usability test with 5 users', { est: 300 }),
      t(33, 'Test', 'Accessibility review (contrast, focus, labels)', { est: 120 }),
      t(35, 'Handoff', 'Developer handoff & specs', { milestone: true }),
    ],
  },
  /* ---------------- Development ---------------- */
  {
    id: 'dev-website', name: 'Website / app development', category: 'Development', icon: 'Code', color: '#64748b', area: 'work', durationDays: 42,
    description: 'Setup, build features in sprints, QA, performance and launch.',
    brief: ['Scope & features', 'Tech stack', 'Environments', 'Integrations', 'Launch date', 'Definition of done'],
    tasks: [
      t(2, 'Setup', 'Repository, CI and environments', { priority: 'high', est: 240 }),
      t(4, 'Setup', 'Architecture & data model', { est: 240 }),
      t(14, 'Sprint 1', 'Core features & authentication', { est: 1800, priority: 'high' }),
      t(15, 'Sprint 1', 'Sprint 1 demo', { milestone: true }),
      t(28, 'Sprint 2', 'Remaining features & integrations', { est: 1800 }),
      t(29, 'Sprint 2', 'Sprint 2 demo', { milestone: true }),
      t(33, 'QA', 'Testing: unit, end-to-end, cross-browser', { est: 600, subtasks: ['Unit tests', 'E2E critical flows', 'Mobile devices', 'Accessibility'] }),
      t(36, 'QA', 'Performance & security review', { est: 300 }),
      t(39, 'Launch', 'Production deploy & monitoring', { priority: 'urgent', est: 180 }),
      t(42, 'Launch', 'Launch complete', { milestone: true }),
    ],
  },
  /* ---------------- Content ---------------- */
  {
    id: 'content-blog', name: 'Blog content plan (8 articles)', category: 'Content', icon: 'BookOpen', color: '#84cc16', area: 'work', durationDays: 30,
    description: 'Topic research, briefs, writing, editing, publishing and promotion for 8 SEO articles.',
    brief: ['Audience', 'Topic clusters', 'Tone of voice', 'Word counts', 'Publishing schedule', 'CTA per article'],
    tasks: [
      t(2, 'Plan', 'Topic & keyword research', { est: 240, priority: 'high' }),
      t(4, 'Plan', 'Write 8 content briefs', { est: 300 }),
      t(11, 'Write', 'Draft articles 1–4', { est: 960 }),
      t(13, 'Edit', 'Edit & optimise articles 1–4', { est: 240 }),
      t(14, 'Publish', 'Publish articles 1–4', { milestone: true }),
      t(22, 'Write', 'Draft articles 5–8', { est: 960 }),
      t(24, 'Edit', 'Edit & optimise articles 5–8', { est: 240 }),
      t(25, 'Publish', 'Publish articles 5–8', { milestone: true }),
      t(28, 'Promote', 'Promote: newsletter, social, internal links', { est: 180 }),
      t(30, 'Report', 'Content performance review', { milestone: true }),
    ],
  },
  /* ---------------- Video ---------------- */
  {
    id: 'video-youtube', name: 'YouTube channel launch', category: 'Video', icon: 'Video', color: '#ef4444', area: 'work', durationDays: 30,
    description: 'Channel setup, first 4 videos, thumbnails, SEO and a publishing rhythm.',
    brief: ['Channel niche', 'Target viewer', 'Video format & length', 'Upload schedule', 'Equipment'],
    tasks: [
      t(2, 'Setup', 'Channel name, banner, about & links', { est: 180 }),
      t(4, 'Plan', 'Video ideas & keyword research', { est: 180, priority: 'high' }),
      t(8, 'Produce', 'Script & record videos 1–2', { est: 600 }),
      t(11, 'Produce', 'Edit videos 1–2 + thumbnails', { est: 600 }),
      t(12, 'Publish', 'Publish video 1', { milestone: true, subtasks: ['Title & description', 'Tags & chapters', 'End screen & cards'] }),
      t(19, 'Produce', 'Script, record & edit videos 3–4', { est: 1200 }),
      t(26, 'Promote', 'Shorts / reels from each video', { est: 240 }),
      t(30, 'Review', 'Analytics review: CTR & retention', { milestone: true }),
    ],
  },
  /* ---------------- Sales ---------------- */
  {
    id: 'sales-onboarding', name: 'Client onboarding', category: 'Sales', icon: 'Users', color: '#0ea5e9', area: 'work', durationDays: 14,
    description: 'From signed contract to a smooth first deliverable.',
    brief: ['Client & contacts', 'Scope & deliverables', 'Timeline', 'Communication channel', 'Billing terms'],
    tasks: [
      t(1, 'Admin', 'Contract & first invoice sent', { priority: 'high' }),
      t(2, 'Admin', 'Welcome email & onboarding questionnaire', { est: 60 }),
      t(4, 'Kickoff', 'Kickoff meeting', { milestone: true, subtasks: ['Agenda', 'Goals & success metrics', 'Roles', 'Next steps'] }),
      t(6, 'Kickoff', 'Collect access & assets', { est: 60 }),
      t(8, 'Plan', 'Share project plan & timeline', { est: 120 }),
      t(12, 'Deliver', 'First deliverable', { priority: 'high', milestone: true }),
      t(14, 'Review', 'Check-in & feedback call', { est: 45 }),
    ],
  },
  /* ---------------- Events ---------------- */
  {
    id: 'event-plan', name: 'Event planning', category: 'Events', icon: 'PartyPopper', color: '#f59e0b', area: 'life', durationDays: 45,
    description: 'Venue, guests, vendors, schedule and the day itself — for a meetup, party or conference.',
    brief: ['Event type & date', 'Guest count', 'Budget', 'Venue requirements', 'Vendors needed'],
    tasks: [
      t(3, 'Plan', 'Set budget, date and guest list', { priority: 'high' }),
      t(8, 'Venue', 'Book venue', { priority: 'high', milestone: true }),
      t(14, 'Vendors', 'Book catering, AV and decoration', { subtasks: ['Catering', 'Sound / projector', 'Decoration', 'Photographer'] }),
      t(18, 'Guests', 'Send invitations', { milestone: true }),
      t(30, 'Guests', 'Track RSVPs & dietary needs'),
      t(38, 'Plan', 'Run-of-show schedule'),
      t(42, 'Plan', 'Confirm all vendors', { priority: 'high' }),
      t(45, 'Event', 'Event day', { priority: 'urgent', milestone: true }),
    ],
  },
  /* ---------------- Personal ---------------- */
  {
    id: 'personal-move', name: 'Moving home', category: 'Personal', icon: 'Home', color: '#22c55e', area: 'home', durationDays: 30,
    description: 'Declutter, pack, transfer utilities and settle into the new place.',
    brief: ['Move date', 'New address', 'Movers / van', 'Budget'],
    tasks: [
      t(2, 'Prepare', 'Book movers or van', { priority: 'high' }),
      t(7, 'Prepare', 'Declutter & sell/donate items'),
      t(14, 'Admin', 'Update address: bank, work, deliveries', { subtasks: ['Bank', 'Employer', 'Online shops', 'Subscriptions'] }),
      t(18, 'Admin', 'Transfer utilities & internet', { priority: 'high' }),
      t(25, 'Pack', 'Pack room by room & label boxes', { est: 900 }),
      t(28, 'Move', 'Moving day', { priority: 'urgent', milestone: true }),
      t(30, 'Settle', 'Unpack essentials & meet neighbours'),
    ],
  },
  {
    id: 'personal-job', name: 'Job search', category: 'Personal', icon: 'Briefcase', color: '#a855f7', area: 'life', durationDays: 42,
    description: 'CV, portfolio, applications, networking and interview preparation.',
    brief: ['Target roles', 'Target companies', 'Salary range', 'Strengths & achievements'],
    tasks: [
      t(3, 'Prepare', 'Update CV & LinkedIn', { priority: 'high', est: 240 }),
      t(7, 'Prepare', 'Portfolio / case studies', { est: 480 }),
      t(10, 'Search', 'List 30 target companies', { est: 120 }),
      t(21, 'Apply', 'Send 15 tailored applications', { est: 900, milestone: true }),
      t(24, 'Network', 'Reach out to 10 contacts', { est: 180 }),
      t(30, 'Interview', 'Interview prep: stories & questions', { est: 300 }),
      t(42, 'Review', 'Review offers & decide', { milestone: true }),
    ],
  },
]
