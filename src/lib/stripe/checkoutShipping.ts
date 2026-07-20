import Stripe from "stripe";
import type { PrintShippingAddress } from "@/types/printBook";

type CheckoutSessionWithCollectedShipping = Stripe.Checkout.Session & {
  shipping_details?: {
    name?: string | null;
    address?: Stripe.Address | null;
  } | null;
  collected_information?: {
    shipping_details?: {
      name?: string | null;
      address?: Stripe.Address | null;
    } | null;
  } | null;
};

export function getCollectedShippingDetails(session: Stripe.Checkout.Session) {
  const sessionWithShipping = session as CheckoutSessionWithCollectedShipping;
  return (
    sessionWithShipping.collected_information?.shipping_details ??
    sessionWithShipping.shipping_details ??
    null
  );
}

export function getSessionCountry(session: Stripe.Checkout.Session) {
  return (
    getCollectedShippingDetails(session)?.address?.country ??
    session.customer_details?.address?.country
  );
}

export function getPrintShippingAddress(
  session: Stripe.Checkout.Session
): PrintShippingAddress | undefined {
  const shippingDetails = getCollectedShippingDetails(session);
  const address = shippingDetails?.address ?? session.customer_details?.address;
  if (
    !address ||
    address.country !== "AU" ||
    !address.line1 ||
    !address.city ||
    !address.postal_code
  ) {
    return undefined;
  }

  return {
    name: shippingDetails?.name ?? session.customer_details?.name ?? undefined,
    email: session.customer_details?.email ?? undefined,
    phone: session.customer_details?.phone ?? undefined,
    line1: address.line1,
    line2: address.line2 ?? undefined,
    city: address.city,
    state: address.state ?? undefined,
    postalCode: address.postal_code,
    countryCode: "AU",
  };
}

export async function retrieveSessionWhenShippingIsMissing(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  if (getCollectedShippingDetails(session)) return session;

  return stripe.checkout.sessions.retrieve(session.id);
}

export async function retrieveCheckoutShipping(
  stripe: Stripe,
  checkoutSessionId: string
) {
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  return {
    billingCountry: getSessionCountry(session),
    shipping: getPrintShippingAddress(session),
  };
}
