import type { LuluQuoteResponse } from "@/lib/print-books/lulu";

export interface PrintMarginQuote {
  customerSubtotalAud: number;
  customerShippingAud: number;
  customerTotalAud: number;
  luluCostAud: number;
  stripeFeeAud: number;
  bufferAud: number;
  minimumMarginAud: number;
  requiredTotalAud: number;
  marginAud: number;
  isSafe: boolean;
}

function aud(value: number) {
  return Number(value.toFixed(2));
}

function moneyValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getLuluMoney(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const money = input as {
    total_cost_incl_tax?: unknown;
    total_cost_excl_tax?: unknown;
  };
  return (
    moneyValue(money.total_cost_incl_tax) ??
    moneyValue(money.total_cost_excl_tax)
  );
}

export function getLuluTotalCostAud(quote: LuluQuoteResponse) {
  const direct = getLuluMoney(quote);
  if (direct !== undefined) return aud(direct);

  const lineItems = Array.isArray(quote.line_item_costs)
    ? quote.line_item_costs
    : [];
  const lineItemCost = lineItems.reduce(
    (sum, item) => sum + (getLuluMoney(item) ?? 0),
    0
  );
  const shippingCost = getLuluMoney(quote.shipping_cost) ?? 0;
  const fulfillmentCost = getLuluMoney(quote.fulfillment_cost) ?? 0;
  const fees = Array.isArray(quote.fees)
    ? quote.fees.reduce((sum, item) => sum + (getLuluMoney(item) ?? 0), 0)
    : 0;

  return aud(lineItemCost + shippingCost + fulfillmentCost + fees);
}

export function getStripeFeeAllowanceAud(totalAud: number) {
  const percent = Number(process.env.PRINT_STRIPE_FEE_PERCENT ?? 0.0175);
  const fixed = Number(process.env.PRINT_STRIPE_FIXED_FEE_AUD ?? 0.3);
  return aud(totalAud * percent + fixed);
}

export function getPrintSupportBufferAud() {
  return aud(Number(process.env.PRINT_SUPPORT_BUFFER_AUD ?? 2));
}

export function getMinimumPrintMarginAud() {
  return aud(Number(process.env.PRINT_MIN_MARGIN_AUD ?? 4));
}

export function quotePrintMargin(input: {
  customerSubtotalAud: number;
  customerShippingAud: number;
  luluQuote?: LuluQuoteResponse;
  fallbackEstimatedCostAud?: number;
}): PrintMarginQuote {
  const customerSubtotalAud = aud(input.customerSubtotalAud);
  const customerShippingAud = aud(input.customerShippingAud);
  const customerTotalAud = aud(customerSubtotalAud + customerShippingAud);
  const luluCostAud = aud(
    input.luluQuote
      ? getLuluTotalCostAud(input.luluQuote)
      : (input.fallbackEstimatedCostAud ?? 0) + customerShippingAud
  );
  const stripeFeeAud = getStripeFeeAllowanceAud(customerTotalAud);
  const bufferAud = getPrintSupportBufferAud();
  const minimumMarginAud = getMinimumPrintMarginAud();
  const requiredTotalAud = aud(
    luluCostAud + stripeFeeAud + bufferAud + minimumMarginAud
  );
  const marginAud = aud(
    customerTotalAud - luluCostAud - stripeFeeAud - bufferAud
  );

  return {
    customerSubtotalAud,
    customerShippingAud,
    customerTotalAud,
    luluCostAud,
    stripeFeeAud,
    bufferAud,
    minimumMarginAud,
    requiredTotalAud,
    marginAud,
    isSafe: customerTotalAud >= requiredTotalAud,
  };
}

export function quotePrintMarginWithFloor(input: {
  baseCustomerSubtotalAud: number;
  customerShippingAud: number;
  luluQuote?: LuluQuoteResponse;
  fallbackEstimatedCostAud?: number;
}): PrintMarginQuote {
  const firstQuote = quotePrintMargin({
    customerSubtotalAud: input.baseCustomerSubtotalAud,
    customerShippingAud: input.customerShippingAud,
    luluQuote: input.luluQuote,
    fallbackEstimatedCostAud: input.fallbackEstimatedCostAud,
  });
  if (firstQuote.isSafe) return firstQuote;

  let customerSubtotalAud = aud(
    firstQuote.requiredTotalAud - input.customerShippingAud
  );
  for (let i = 0; i < 5; i += 1) {
    const nextQuote = quotePrintMargin({
      customerSubtotalAud,
      customerShippingAud: input.customerShippingAud,
      luluQuote: input.luluQuote,
      fallbackEstimatedCostAud: input.fallbackEstimatedCostAud,
    });
    if (nextQuote.isSafe) return nextQuote;
    customerSubtotalAud = aud(
      customerSubtotalAud +
        nextQuote.requiredTotalAud -
        nextQuote.customerTotalAud
    );
  }

  return quotePrintMargin({
    customerSubtotalAud,
    customerShippingAud: input.customerShippingAud,
    luluQuote: input.luluQuote,
    fallbackEstimatedCostAud: input.fallbackEstimatedCostAud,
  });
}

export function toAudCents(amountAud: number) {
  return Math.round(amountAud * 100);
}
