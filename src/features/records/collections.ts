import type { Area, CollectionKey } from '@/types/models'

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox' | 'url' | 'tel' | 'email' | 'rating'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required?: boolean
  placeholder?: string
  /** Show as a column / chip in the list view. */
  list?: boolean
  /** Hide on Sensitive mode (e.g. account numbers). */
  sensitive?: boolean
}

/**
 * Generic list-module definition. Core fields (title, dueDate, amount, category, priority, done, recurrence)
 * live on RecordItem itself; module-specific fields go in `fields`.
 */
export interface CollectionDef {
  key: CollectionKey
  label: string
  singular: string
  area: Area
  path: string
  titleLabel: string
  /** Which core fields this collection uses. */
  core: { due?: string; amount?: string; category?: string[]; priority?: boolean; done?: string; recurrence?: boolean }
  fields: FieldDef[]
  emptyHint: string
}

const def = (c: CollectionDef) => c

export const COLLECTIONS: Record<CollectionKey, CollectionDef> = {
  /* ---------------- Home ---------------- */
  chores: def({
    key: 'chores', label: 'Chores & household tasks', singular: 'Chore', area: 'home', path: '/home/chores', titleLabel: 'Chore',
    core: { due: 'Due', category: ['Cleaning', 'Laundry', 'Kitchen', 'Garden', 'Pets', 'Errands', 'Other'], priority: true, done: 'Done', recurrence: true },
    fields: [
      { key: 'room', label: 'Room', type: 'select', options: ['Kitchen', 'Living room', 'Bedroom', 'Bathroom', 'Garage', 'Garden', 'Office', 'Whole house'], list: true },
      { key: 'assignee', label: 'Assigned to', type: 'text', list: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Add recurring chores like “Take out recycling — every Tuesday”.',
  }),
  groceries: def({
    key: 'groceries', label: 'Grocery & shopping lists', singular: 'Item', area: 'home', path: '/home/groceries', titleLabel: 'Item',
    core: { amount: 'Est. price', category: ['Produce', 'Dairy', 'Meat & fish', 'Bakery', 'Pantry', 'Frozen', 'Household', 'Personal care', 'Other'], done: 'In cart' },
    fields: [
      { key: 'list', label: 'List', type: 'text', placeholder: 'Weekly groceries', list: true },
      { key: 'quantity', label: 'Quantity', type: 'text', placeholder: '2 kg', list: true },
      { key: 'store', label: 'Store', type: 'text' },
    ],
    emptyHint: 'Build your shopping list — check items off as they go in the cart.',
  }),
  maintenance: def({
    key: 'maintenance', label: 'Home maintenance', singular: 'Maintenance item', area: 'home', path: '/home/maintenance', titleLabel: 'Task',
    core: { due: 'Next due', amount: 'Cost', category: ['HVAC', 'Plumbing', 'Electrical', 'Appliances', 'Exterior', 'Safety', 'Vehicle', 'Other'], priority: true, done: 'Done', recurrence: true },
    fields: [
      { key: 'room', label: 'Room / area', type: 'text', list: true },
      { key: 'provider', label: 'Service provider', type: 'text' },
      { key: 'providerPhone', label: 'Provider phone', type: 'tel' },
      { key: 'lastDone', label: 'Last done', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Track filter changes, smoke-alarm tests and boiler services with recurring schedules.',
  }),
  bills: def({
    key: 'bills', label: 'Household bills', singular: 'Bill', area: 'home', path: '/home/bills', titleLabel: 'Bill / payee',
    core: { due: 'Due date', amount: 'Amount', category: ['Rent / mortgage', 'Electricity', 'Gas', 'Water', 'Internet', 'Phone', 'Insurance', 'Subscription', 'Tax', 'Other'], done: 'Paid', recurrence: true },
    fields: [
      { key: 'account', label: 'Account reference', type: 'text', sensitive: true },
      { key: 'method', label: 'Payment method', type: 'select', options: ['Bank transfer', 'Direct debit', 'Card', 'Cash', 'Other'], list: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Add bills with due dates; marking a recurring bill paid schedules the next one.',
  }),
  inventory: def({
    key: 'inventory', label: 'Home inventory & warranties', singular: 'Item', area: 'home', path: '/home/inventory', titleLabel: 'Item',
    core: { due: 'Warranty until', amount: 'Value', category: ['Electronics', 'Appliances', 'Furniture', 'Jewelry', 'Tools', 'Documents', 'Other'] },
    fields: [
      { key: 'room', label: 'Room', type: 'text', list: true },
      { key: 'brand', label: 'Brand / model', type: 'text', list: true },
      { key: 'serial', label: 'Serial number', type: 'text', sensitive: true },
      { key: 'purchaseDate', label: 'Purchase date', type: 'date' },
      { key: 'store', label: 'Purchased from', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Record valuables, serial numbers and warranty expiry dates.',
  }),
  contacts: def({
    key: 'contacts', label: 'Contacts', singular: 'Contact', area: 'home', path: '/home/contacts', titleLabel: 'Name',
    core: { category: ['Emergency', 'Family', 'Doctor', 'Service provider', 'Neighbour', 'Client', 'Colleague', 'Vendor', 'Other'] },
    fields: [
      { key: 'phone', label: 'Phone', type: 'tel', list: true },
      { key: 'email', label: 'Email', type: 'email', list: true },
      { key: 'company', label: 'Company / relation', type: 'text', list: true },
      { key: 'address', label: 'Address', type: 'textarea', sensitive: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Keep emergency numbers, doctors, clients and service providers in one place.',
  }),
  /* ---------------- Work ---------------- */
  workspaces: def({
    key: 'workspaces', label: 'Workspaces', singular: 'Workspace', area: 'work', path: '/work/workspaces', titleLabel: 'Workspace name',
    core: { category: ['Company', 'Client', 'Side project', 'Team', 'Other'] },
    fields: [{ key: 'description', label: 'Description', type: 'textarea', list: true }],
    emptyHint: 'Workspaces group projects (e.g. “Acme Corp”, “Freelance”).',
  }),
  meetings: def({
    key: 'meetings', label: 'Meetings', singular: 'Meeting', area: 'work', path: '/work/meetings', titleLabel: 'Meeting title',
    core: { due: 'Date', category: ['1:1', 'Team', 'Client', 'Interview', 'Planning', 'Review', 'Other'], done: 'Held', recurrence: true },
    fields: [
      { key: 'time', label: 'Time', type: 'text', placeholder: '14:00', list: true },
      { key: 'attendees', label: 'Attendees', type: 'text', list: true },
      { key: 'location', label: 'Location / link', type: 'text' },
      { key: 'agenda', label: 'Agenda', type: 'textarea' },
      { key: 'minutes', label: 'Minutes', type: 'textarea' },
      { key: 'actions', label: 'Action items', type: 'textarea' },
    ],
    emptyHint: 'Schedule meetings, write agendas, and capture minutes and action items.',
  }),
  invoices: def({
    key: 'invoices', label: 'Invoices', singular: 'Invoice', area: 'work', path: '/work/invoices', titleLabel: 'Invoice #',
    core: { due: 'Due date', amount: 'Amount', category: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'], done: 'Paid' },
    fields: [
      { key: 'client', label: 'Client', type: 'text', list: true, required: true },
      { key: 'issueDate', label: 'Issue date', type: 'date', list: true },
      { key: 'description', label: 'Line items / description', type: 'textarea' },
    ],
    emptyHint: 'Track invoices you issue. (This app records invoices; it does not send them.)',
  }),
  goals: def({
    key: 'goals', label: 'Goals', singular: 'Goal', area: 'life', path: '/life/goals', titleLabel: 'Goal',
    core: { due: 'Target date', category: ['Health', 'Career', 'Finance', 'Learning', 'Relationships', 'Personal', 'Business'], priority: true, done: 'Achieved' },
    fields: [
      { key: 'progress', label: 'Progress %', type: 'number', list: true },
      { key: 'milestones', label: 'Milestones (one per line)', type: 'textarea' },
      { key: 'why', label: 'Why it matters', type: 'textarea' },
    ],
    emptyHint: 'Set goals with target dates, milestones and a progress percentage.',
  }),
  habits: def({
    key: 'habits', label: 'Habits', singular: 'Habit', area: 'life', path: '/life/habits', titleLabel: 'Habit',
    core: { category: ['Health', 'Mind', 'Learning', 'Productivity', 'Social', 'Other'] },
    fields: [
      { key: 'target', label: 'Target per week', type: 'number', list: true },
      { key: 'cue', label: 'Cue / routine', type: 'text' },
    ],
    emptyHint: 'Create a habit, then tick it off each day.',
  }),
  journal: def({
    key: 'journal', label: 'Journal', singular: 'Entry', area: 'life', path: '/life/journal', titleLabel: 'Title',
    core: { due: 'Date', category: ['Daily', 'Gratitude', 'Reflection', 'Idea', 'Dream', 'Other'] },
    fields: [
      { key: 'mood', label: 'Mood (1–5)', type: 'rating', list: true },
      { key: 'entry', label: 'Entry', type: 'textarea', required: true, sensitive: true },
    ],
    emptyHint: 'Write your first journal entry. Keep very private entries in the encrypted Vault.',
  }),
  reading: def({
    key: 'reading', label: 'Reading & learning', singular: 'Item', area: 'life', path: '/life/reading', titleLabel: 'Title',
    core: { category: ['Book', 'Course', 'Article', 'Podcast', 'Video', 'Other'], done: 'Finished' },
    fields: [
      { key: 'author', label: 'Author / provider', type: 'text', list: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Want to', 'In progress', 'Finished', 'Abandoned'], list: true },
      { key: 'rating', label: 'Rating', type: 'rating' },
      { key: 'link', label: 'Link', type: 'url' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Track books, courses and articles you want to read or learn.',
  }),
  trips: def({
    key: 'trips', label: 'Trips', singular: 'Trip', area: 'life', path: '/life/travel', titleLabel: 'Destination',
    core: { due: 'Departure', amount: 'Budget', category: ['Leisure', 'Business', 'Family', 'Weekend', 'Other'], done: 'Completed' },
    fields: [
      { key: 'returnDate', label: 'Return', type: 'date', list: true },
      { key: 'accommodation', label: 'Accommodation', type: 'text' },
      { key: 'booking', label: 'Booking refs', type: 'text', sensitive: true },
      { key: 'itinerary', label: 'Itinerary', type: 'textarea' },
    ],
    emptyHint: 'Plan trips with dates, budget and itinerary.',
  }),
  packing: def({
    key: 'packing', label: 'Packing checklist', singular: 'Item', area: 'life', path: '/life/packing', titleLabel: 'Item',
    core: { category: ['Clothes', 'Toiletries', 'Documents', 'Electronics', 'Health', 'Other'], done: 'Packed' },
    fields: [{ key: 'trip', label: 'Trip', type: 'text', list: true }, { key: 'qty', label: 'Qty', type: 'text', list: true }],
    emptyHint: 'List what to pack, grouped by trip.',
  }),
  fitness: def({
    key: 'fitness', label: 'Fitness & wellness', singular: 'Log', area: 'life', path: '/life/fitness', titleLabel: 'Activity',
    core: { due: 'Date', category: ['Run', 'Walk', 'Gym', 'Cycling', 'Yoga', 'Swim', 'Sleep', 'Meditation', 'Water', 'Weight', 'Other'] },
    fields: [
      { key: 'minutes', label: 'Duration (min)', type: 'number', list: true },
      { key: 'metric', label: 'Metric (km, kg, hrs…)', type: 'text', list: true },
      { key: 'energy', label: 'Energy (1–5)', type: 'rating' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Log workouts, sleep, weight or meditation.',
  }),
  foods: def({
    key: 'foods', label: 'Foods', singular: 'Food', area: 'life', path: '/life/foods', titleLabel: 'Food',
    core: { due: 'Date', category: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] },
    fields: [
      { key: 'time', label: 'Time', type: 'text', list: true },
      { key: 'calories', label: 'Calories (kcal)', type: 'number', list: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Log what you eat by meal, time and optional calories.',
  }),
  reviews: def({
    key: 'reviews', label: 'Reviews', singular: 'Review', area: 'life', path: '/life/reviews', titleLabel: 'Title',
    core: { due: 'Date', category: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'] },
    fields: [
      { key: 'wins', label: 'Wins', type: 'textarea' },
      { key: 'challenges', label: 'Challenges', type: 'textarea' },
      { key: 'lessons', label: 'Lessons', type: 'textarea' },
      { key: 'nextFocus', label: 'Next focus', type: 'textarea' },
      { key: 'score', label: 'Overall (1–5)', type: 'rating', list: true },
    ],
    emptyHint: 'Reflect daily, weekly or monthly on wins, challenges and focus.',
  }),
  importantDates: def({
    key: 'importantDates', label: 'Important dates & birthdays', singular: 'Date', area: 'life', path: '/life/dates', titleLabel: 'Occasion',
    core: { due: 'Date', category: ['Birthday', 'Anniversary', 'Holiday', 'Deadline', 'Renewal', 'Other'], recurrence: true },
    fields: [{ key: 'person', label: 'Person', type: 'text', list: true }, { key: 'notes', label: 'Gift ideas / notes', type: 'textarea' }],
    emptyHint: 'Add birthdays and anniversaries — set them to repeat yearly. They appear on the calendar.',
  }),
  /* ---------------- Finance ---------------- */
  expenses: def({
    key: 'expenses', label: 'Expenses', singular: 'Expense', area: 'personal', path: '/finance/expenses', titleLabel: 'Description',
    core: { due: 'Date', amount: 'Amount', category: ['Food', 'Groceries', 'Transport', 'Housing', 'Utilities', 'Health', 'Entertainment', 'Shopping', 'Education', 'Travel', 'Business', 'Other'] },
    fields: [
      { key: 'payee', label: 'Payee', type: 'text', list: true },
      { key: 'method', label: 'Payment method', type: 'select', options: ['Card', 'Cash', 'Bank transfer', 'Wallet', 'Other'], list: true },
      { key: 'reimbursable', label: 'Reimbursable', type: 'checkbox' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    emptyHint: 'Record expenses; choose Home, Work or Personal to keep them separated.',
  }),
  income: def({
    key: 'income', label: 'Income', singular: 'Income', area: 'personal', path: '/finance/income', titleLabel: 'Source',
    core: { due: 'Date', amount: 'Amount', category: ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Refund', 'Other'] },
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    emptyHint: 'Track income to see your monthly net.',
  }),
  budgets: def({
    key: 'budgets', label: 'Budgets', singular: 'Budget', area: 'personal', path: '/finance/budgets', titleLabel: 'Budget name',
    core: { amount: 'Monthly limit', category: ['Food', 'Groceries', 'Transport', 'Housing', 'Utilities', 'Health', 'Entertainment', 'Shopping', 'Education', 'Travel', 'Business', 'Other'] },
    fields: [],
    emptyHint: 'Set a monthly limit per category; spending is compared against it.',
  }),
}
