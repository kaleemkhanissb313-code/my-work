import type { BaseEntity, ID } from '@/types/models'

/**
 * GLAMIEX data model.
 * MONEY: every amount is an integer number of PAISA (1 PKR = 100 paisa) to avoid floating-point drift.
 * TIME: transaction instants are stored as UTC ISO strings (`at`); calendar dates are derived in the
 *       GLAMIEX time zone (Settings → time zone, default the device zone) for reporting.
 */
export type Paisa = number

export type ProductStatus = 'active' | 'inactive' | 'discontinued'
export interface GxProduct extends BaseEntity {
  name: string
  sku: string
  category: string
  description: string
  /** Current buying (unit) cost — used as the cost snapshot for NEW sales only. */
  buyPrice: Paisa
  /** Current list selling price — default for NEW sales only. */
  sellPrice: Paisa
  lowStockAt: number
  status: ProductStatus
  supplierName: string
  supplierContact: string
  imageIds: ID[]
  videoIds: ID[]
  dateAdded: string
}

export type StockReason = 'opening' | 'purchase' | 'sale' | 'cancel' | 'refund' | 'adjust'
/** Append-only inventory ledger. Deterministic ids (e.g. `sale:<orderId>:<productId>`) make postings idempotent. */
export interface GxStockMove extends BaseEntity {
  productId: ID
  qty: number
  reason: StockReason
  refId: string | null
  note: string
  at: string
}

/** Snapshot of the product at the moment of sale — later price changes never rewrite history. */
export interface GxOrderItem {
  productId: ID
  name: string
  sku: string
  qty: number
  unitPrice: Paisa
  unitCost: Paisa
}

export type OrderStatus = 'completed' | 'cancelled' | 'refunded'
export type PaymentMethod = 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'card' | 'cod' | 'other'
export interface GxOrder extends BaseEntity {
  orderNo: string
  personId: ID | null
  items: GxOrderItem[]
  discount: Paisa
  tax: Paisa
  status: OrderStatus
  method: PaymentMethod
  at: string
  notes: string
  attachmentIds: ID[]
  cancelledAt: number | null
  cancelReason: string
}

export interface GxRefund extends BaseEntity {
  orderId: ID
  amount: Paisa
  /** Units returned to stock per product (also reduces COGS and units sold). */
  restock: { productId: ID; qty: number; unitCost: Paisa }[]
  reason: string
  at: string
}

export type PersonType = 'customer' | 'staff' | 'partner' | 'owner' | 'supplier' | 'other'
export interface GxPerson extends BaseEntity {
  name: string
  type: PersonType
  phone: string
  email: string
  address: string
  /** Positive = the person owes the business; negative = the business owes the person. */
  openingBalance: Paisa
  notes: string
  attachmentIds: ID[]
}

/**
 * Money movements with a person.
 *  - customer_payment : customer pays for sales (cash in, reduces receivable)
 *  - customer_deposit : advance from a customer (cash in, customer credit — NOT revenue until applied to a sale)
 *  - owner_contribution / loan_in : financing (cash in, never revenue)
 *  - payout           : business pays a person (staff salary, supplier, partner) (cash out)
 *  - owner_drawing    : owner withdraws money (cash out, not an expense)
 *  - refund_paid      : money returned to a customer (cash out)
 *  - adjustment       : write-off / correction to a person's balance (no cash)
 */
export type PaymentType = 'customer_payment' | 'customer_deposit' | 'owner_contribution' | 'loan_in' | 'payout' | 'owner_drawing' | 'refund_paid' | 'adjustment'
export interface GxPayment extends BaseEntity {
  txnNo: string
  personId: ID | null
  type: PaymentType
  /** Always positive; direction is given by `type`. For `adjustment`, positive reduces what the person owes. */
  amount: Paisa
  method: PaymentMethod
  at: string
  reference: string
  /** Portions applied to specific orders (sum ≤ amount). */
  allocations: { orderId: ID; amount: Paisa }[]
  notes: string
  attachmentIds: ID[]
  /** Voided payments stay for audit but are excluded from every calculation. */
  voided: boolean
}

export interface GxAdIncome extends BaseEntity {
  platform: string
  campaign: string
  reportDate: string
  periodStart: string
  periodEnd: string
  /** Gross and adjustments in the ORIGINAL currency, in minor units. */
  gross: number
  adjustments: number
  currency: string
  exchangeRate: number
  /** Net earnings converted to PKR paisa = round((gross + adjustments) × rate). */
  netPkr: Paisa
  notes: string
  attachmentIds: ID[]
}

export interface GxAdSpend extends BaseEntity {
  platform: string
  campaign: string
  campaignId: string
  amount: number
  currency: string
  exchangeRate: number
  amountPkr: Paisa
  start: string
  end: string
  clicks: number | null
  impressions: number | null
  conversions: number | null
  attributedSales: Paisa | null
  notes: string
  attachmentIds: ID[]
}

export interface GxExpense extends BaseEntity {
  category: string
  description: string
  amount: Paisa
  date: string
  method: PaymentMethod
  vendor: string
  notes: string
  attachmentIds: ID[]
}

export type GxEntity = 'product' | 'order' | 'refund' | 'person' | 'payment' | 'adIncome' | 'adSpend' | 'expense' | 'stock' | 'settings' | 'sheet'
export interface GxAuditEvent { id: string; at: number; entity: GxEntity; entityId: string; action: 'create' | 'update' | 'cancel' | 'refund' | 'void' | 'delete' | 'restore' | 'adjust'; summary: string }

export type GxPreset = 'neon' | 'glass' | 'executive' | 'aurora' | 'minimal'
export interface GxSettings {
  timeZone: string
  taxRatePct: number
  taxInclusive: boolean
  allowNegativeStock: boolean
  defaultLowStock: number
  preset: GxPreset
  gxAccent: 'violet' | 'blue' | 'emerald' | 'rose'
  density: 'comfortable' | 'compact'
  chartStyle: 'smooth' | 'linear'
  chartGradient: boolean
  sidebar: 'expanded' | 'collapsed'
  expenseCategories: string[]
}

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' }, { id: 'bank', label: 'Bank transfer' }, { id: 'jazzcash', label: 'JazzCash' }, { id: 'easypaisa', label: 'Easypaisa' },
  { id: 'card', label: 'Card' }, { id: 'cod', label: 'Cash on delivery' }, { id: 'other', label: 'Other' },
]
export const PERSON_TYPES: { id: PersonType; label: string }[] = [
  { id: 'customer', label: 'Customer' }, { id: 'staff', label: 'Staff' }, { id: 'partner', label: 'Partner' }, { id: 'owner', label: 'Owner' },
  { id: 'supplier', label: 'Supplier' }, { id: 'other', label: 'Other' },
]
export const PAYMENT_TYPES: { id: PaymentType; label: string; dir: 'in' | 'out' | 'none'; hint: string }[] = [
  { id: 'customer_payment', label: 'Customer payment', dir: 'in', hint: 'Payment for sales — can be allocated to orders' },
  { id: 'customer_deposit', label: 'Customer deposit / advance', dir: 'in', hint: 'Held as customer credit, not revenue' },
  { id: 'owner_contribution', label: 'Owner contribution', dir: 'in', hint: 'Financing — never counted as sales revenue' },
  { id: 'loan_in', label: 'Loan received', dir: 'in', hint: 'Financing — must be repaid' },
  { id: 'payout', label: 'Payout (salary, supplier, partner)', dir: 'out', hint: 'Money paid to a person' },
  { id: 'owner_drawing', label: 'Owner drawing', dir: 'out', hint: 'Owner withdrawal — not an expense' },
  { id: 'refund_paid', label: 'Refund paid to customer', dir: 'out', hint: 'Cash returned for a refund' },
  { id: 'adjustment', label: 'Balance adjustment / write-off', dir: 'none', hint: 'No cash; corrects what the person owes' },
]
export const DEFAULT_EXPENSE_CATEGORIES = ['Shipping', 'Packaging', 'Salaries', 'Rent', 'Utilities', 'Subscriptions', 'Marketing', 'Software', 'Bank fees', 'Miscellaneous']
