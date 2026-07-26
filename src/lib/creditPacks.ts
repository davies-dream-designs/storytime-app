export const CREDIT_PACKS = {
  starter: {
    id: "starter",
    label: "Starter",
    productName: "Storycot Starter - 10 stories",
    credits: 10,
    amount: 499,
    price: "$4.99",
    priceNote: "AUD",
    popular: false,
  },
  family: {
    id: "family",
    label: "Family",
    productName: "Storycot Family - 30 stories",
    credits: 30,
    amount: 1199,
    price: "$11.99",
    priceNote: "AUD",
    popular: true,
  },
  pro: {
    id: "pro",
    label: "Bedtime Pro",
    productName: "Storycot Bedtime Pro - 100 stories",
    credits: 100,
    amount: 2999,
    price: "$29.99",
    priceNote: "AUD",
    popular: false,
  },
} as const;

export type CreditPackId = keyof typeof CREDIT_PACKS;

export function isCreditPackId(value: unknown): value is CreditPackId {
  return typeof value === "string" && value in CREDIT_PACKS;
}

export function formatAudCents(cents: number) {
  return `$${(cents / 100).toFixed(2)} AUD`;
}
