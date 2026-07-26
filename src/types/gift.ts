export type GiftOrderStatus =
  "checkout_started" | "paid" | "redeeming" | "redeemed" | "refunded";

export interface GiftOrder {
  id: string;
  token: string;
  purchaserUserId: string;
  purchaserEmail?: string;
  recipientEmail: string;
  recipientName?: string;
  message?: string;
  packId: string;
  credits: number;
  amountAud: number; // Stored as AUD cents to match Stripe unit_amount.
  status: GiftOrderStatus;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  referralReferrerUserId?: string;
  referralGrantedAt?: string;
  paidAt?: string;
  redeemedByUserId?: string;
  redeemedAt?: string;
  createdAt: string;
  updatedAt: string;
}
