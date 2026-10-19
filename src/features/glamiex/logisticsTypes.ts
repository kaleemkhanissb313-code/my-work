import type { BaseEntity, ID } from '@/types/models'
import type { Paisa, PaymentMethod } from './types'

/* =====================================================================================================
 * Returns, deliveries, delivery partners (riders / couriers) and rider settlements.
 * Accounting rules (enforced in logistics.ts and logisticsService.ts):
 *  - A return's REFUND is posted once, as a normal GxRefund (id `ret:<returnId>`), so net sales, COGS and stock
 *    use the same engine as every other refund and are never counted a second time.
 *  - Sellable inventory increases ONLY when a received return is approved "restock as sellable" (a zero-amount
 *    refund record `retstock:<returnId>` with restock lines, which also reverses COGS for those units).
 *  - Damaged / repair / write-off units never re-enter sellable stock; their original cost stays in COGS.
 *  - Delivery cost is recognised from rider earnings (accrual). Paying a rider is a SETTLEMENT (cash out against
 *    the payable), never a second expense. Customer-paid delivery charges are tracked separately as income.
 * ===================================================================================================== */
export type ReturnReason = 'damaged' | 'wrong_product' | 'defective' | 'changed_mind' | 'failed_delivery' | 'other'
export type ReturnStatus = 'requested' | 'approved' | 'pickup_scheduled' | 'received' | 'inspection_pending' | 'restock_approved' | 'damaged' | 'refund_pending' | 'refunded' | 'rejected' | 'completed'
export type ReturnDisposition = 'sellable' | 'damaged_stock' | 'repair' | 'write_off'
export interface GxReturn extends BaseEntity {
  returnNo: string
  orderId: ID
  personId: ID | null
  customerName: string
  customerContact: string
  productId: ID
  productName: string
  imageId: ID | null
  /** Snapshots from the original order line. */
  qtySold: number
  qtyReturned: number
  unitCost: Paisa
  unitPrice: Paisa
  at: string
  reason: ReturnReason
  /** Approved refund amount (posted to the sales ledger only when the refund is posted). */
  refundAmount: Paisa
  /** Direct return shipping cost — used only when no pickup rider is assigned (otherwise the pickup earning is the cost). */
  shippingCost: Paisa
  handlingCost: Paisa
  otherCost: Paisa
  condition: string
  status: ReturnStatus
  disposition: ReturnDisposition | null
  /** Estimated recoverable value of damaged / repair stock (sellable restock is valued at cost automatically). */
  salvageValue: Paisa
  /** Reverse delivery (customer → business). */
  pickupPartnerId: ID | null
  pickupDate: string
  pickupQty: number
  /** Rider payment for this pickup, fixed when the rider is assigned. */
  pickupPay: Paisa
  received: boolean
  receivedAt: string | null
  /** Set once the refund / restock has been posted to the sales ledger (never posted twice). */
  refundPostedAt: string | null
  restockPostedAt: string | null
  notes: string
  attachmentIds: ID[]
}

export type ShipmentStatus = 'pending' | 'ready' | 'assigned' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'rescheduled' | 'cancelled' | 'returned'
export type RateRule = 'per_order' | 'per_product' | 'per_km'
export type PartialPayPolicy = 'none' | 'full' | 'fixed'
export interface RateSnapshot { rule: RateRule; perOrder: Paisa; perProduct: Paisa; perKm: Paisa; failed: PartialPayPolicy; failedFixed: Paisa; returned: PartialPayPolicy; returnedFixed: Paisa }
export interface GxShipment extends BaseEntity {
  shipmentNo: string
  orderId: ID | null
  customerName: string
  customerAddress: string
  customerPhone: string
  items: { productId: ID; name: string; qty: number }[]
  partnerId: ID | null
  /** Rate rule copied from the partner at assignment, so later rate changes never rewrite past earnings. */
  rate: RateSnapshot | null
  distanceKm: number | null
  dispatchAt: string | null
  expectedDate: string
  deliveredAt: string | null
  /** When the shipment reached a final status (delivered / failed / returned / cancelled); the accrual date. */
  finalAt: string | null
  customerCharge: Paisa
  /** Cost of a courier without a partner account (used only when partnerId is null). */
  actualCost: Paisa
  /** Special charge payable to the rider for this shipment (added to earnings). */
  extraCharge: Paisa
  status: ShipmentStatus
  trackingNo: string
  proofIds: ID[]
  notes: string
  attachmentIds: ID[]
}

export type PartnerKind = 'rider' | 'company'
export interface GxPartner extends BaseEntity {
  name: string
  kind: PartnerKind
  code: string
  phone: string
  email: string
  method: PaymentMethod
  rateRule: RateRule
  perOrder: Paisa
  perProduct: Paisa
  perKm: Paisa
  /** Rate for a return pickup (used unless pickups count as deliveries). */
  pickupRate: Paisa
  countPickupAsDelivery: boolean
  failedPolicy: PartialPayPolicy
  failedFixed: Paisa
  returnedPolicy: PartialPayPolicy
  returnedFixed: Paisa
  status: 'active' | 'inactive'
  notes: string
  attachmentIds: ID[]
}

export interface GxRiderPayment extends BaseEntity {
  settlementNo: string
  partnerId: ID
  periodFrom: string
  periodTo: string
  /** Snapshots shown on the settlement statement. */
  completedDeliveries: number
  grossEarnings: Paisa
  /** Additional charges / deductions agreed in this settlement (they change what is owed). */
  additions: Paisa
  deductions: Paisa
  amountPaid: Paisa
  at: string
  method: PaymentMethod
  reference: string
  notes: string
  attachmentIds: ID[]
  voided: boolean
}

/* ---------------- Names & Payments (standalone obligations ledger) ---------------- */
export interface NpPerson extends BaseEntity {
  name: string
  phone: string
  /** Amount this person is expected to pay. */
  obligation: Paisa
  notes: string
}
export interface NpPayment extends BaseEntity {
  receiptNo: string
  personId: ID
  amount: Paisa
  at: string
  method: PaymentMethod
  reference: string
  notes: string
  /** Optional explicit link to another GLAMIEX transaction (e.g. a txn no.). Empty = independent. */
  linkedRef: string
  voided: boolean
}

export const RETURN_REASONS: { id: ReturnReason; label: string }[] = [
  { id: 'damaged', label: 'Damaged product' }, { id: 'wrong_product', label: 'Wrong product' }, { id: 'defective', label: 'Defective product' },
  { id: 'changed_mind', label: 'Customer changed mind' }, { id: 'failed_delivery', label: 'Failed delivery' }, { id: 'other', label: 'Other' },
]
export const RETURN_STATUSES: { id: ReturnStatus; label: string }[] = [
  { id: 'requested', label: 'Requested' }, { id: 'approved', label: 'Approved' }, { id: 'pickup_scheduled', label: 'Pickup scheduled' }, { id: 'received', label: 'Received' },
  { id: 'inspection_pending', label: 'Inspection pending' }, { id: 'restock_approved', label: 'Restock approved' }, { id: 'damaged', label: 'Damaged or unsellable' },
  { id: 'refund_pending', label: 'Refund pending' }, { id: 'refunded', label: 'Refunded' }, { id: 'rejected', label: 'Rejected' }, { id: 'completed', label: 'Completed' },
]
export const DISPOSITIONS: { id: ReturnDisposition; label: string }[] = [
  { id: 'sellable', label: 'Restock as sellable' }, { id: 'damaged_stock', label: 'Keep as damaged / discounted stock' },
  { id: 'repair', label: 'Send for repair' }, { id: 'write_off', label: 'Write off as unsellable' },
]
export const SHIPMENT_STATUSES: { id: ShipmentStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' }, { id: 'ready', label: 'Ready for dispatch' }, { id: 'assigned', label: 'Assigned to rider' }, { id: 'picked_up', label: 'Picked up' },
  { id: 'in_transit', label: 'In transit' }, { id: 'out_for_delivery', label: 'Out for delivery' }, { id: 'delivered', label: 'Delivered' }, { id: 'failed', label: 'Failed delivery' },
  { id: 'rescheduled', label: 'Rescheduled' }, { id: 'cancelled', label: 'Cancelled' }, { id: 'returned', label: 'Returned to sender' },
]
export const FINAL_SHIPMENT: ShipmentStatus[] = ['delivered', 'failed', 'cancelled', 'returned']
export const RATE_RULES: { id: RateRule; label: string }[] = [
  { id: 'per_order', label: 'Per delivery (order)' }, { id: 'per_product', label: 'Per product delivered' }, { id: 'per_km', label: 'Per km (distance)' },
]
export const PAY_POLICIES: { id: PartialPayPolicy; label: string }[] = [
  { id: 'none', label: 'Not paid' }, { id: 'full', label: 'Paid at the normal rate' }, { id: 'fixed', label: 'Fixed amount' },
]
