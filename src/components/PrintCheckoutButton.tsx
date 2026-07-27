"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { usePendingUI } from "@/components/GlobalPending";
import type { PrintProductKey } from "@/lib/print-books/printProducts";
import type { PrintShippingAddress } from "@/types/printBook";

type AddressSuggestion = {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
};

type AddressDetailsResponse = {
  address?: Pick<
    PrintShippingAddress,
    "line1" | "city" | "state" | "postalCode" | "countryCode"
  >;
  error?: string;
};

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

export default function PrintCheckoutButton({
  projectId,
  productKey,
  priceAud,
  disabled,
  label,
}: {
  projectId: string;
  productKey: PrintProductKey;
  priceAud: number;
  disabled?: boolean;
  label?: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [shipping, setShipping] = useState<PrintShippingAddress>({
    name: "",
    email: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    countryCode: "AU",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState("");
  const addressRequestRef = useRef(0);
  const { startPending } = usePendingUI();

  useEffect(() => {
    if (!modalOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        setModalOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loading, modalOpen]);

  function updateShipping(key: keyof PrintShippingAddress, value: string) {
    setShipping((current) => ({
      ...current,
      [key]: key === "state" ? value.toUpperCase() : value,
    }));
  }

  useEffect(() => {
    const input = shipping.line1.trim();
    const requestId = addressRequestRef.current + 1;
    addressRequestRef.current = requestId;

    if (input.length < 3) {
      setSuggestions([]);
      setAddressLoading(false);
      return;
    }

    setAddressLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/address/autocomplete?input=${encodeURIComponent(input)}`
        );
        const data = (await res.json()) as {
          suggestions?: AddressSuggestion[];
        };
        if (addressRequestRef.current !== requestId) return;
        setSuggestions(data.suggestions ?? []);
        setShowSuggestions(true);
      } catch {
        if (addressRequestRef.current === requestId) {
          setSuggestions([]);
        }
      } finally {
        if (addressRequestRef.current === requestId) {
          setAddressLoading(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [shipping.line1]);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    setAddressLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/address/details?placeId=${encodeURIComponent(suggestion.placeId)}`
      );
      const data = (await res.json()) as AddressDetailsResponse;
      if (!res.ok || !data.address) {
        throw new Error(data.error ?? "Could not read that address.");
      }

      setShipping((current) => ({
        ...current,
        ...data.address,
        countryCode: "AU",
      }));
      setSuggestions([]);
      setShowSuggestions(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read that address."
      );
    } finally {
      setAddressLoading(false);
    }
  }

  async function startCheckout(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    const stopPending = startPending(
      "Calculating shipping and preparing checkout...",
      20000
    );

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "print_book",
          projectId,
          productKey,
          quantity,
          shipping,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }

      startPending("Opening secure checkout...", 20000);
      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start checkout."
      );
      setLoading(false);
      stopPending();
    }
  }

  const total = priceAud * quantity;

  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setError("");
          setModalOpen(true);
        }}
        className="storycot-btn storycot-btn-primary w-full"
      >
        {label ?? "Order hardcover"}
      </button>

      {!disabled ? (
        <p className="mt-2 text-center text-xs text-night-400">
          Shipping is calculated before payment. Australia only.
        </p>
      ) : null}

      {modalOpen && !disabled ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-night-900/55 px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) {
              setModalOpen(false);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-checkout-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
            onSubmit={startCheckout}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-star-600">
                  Hardcover
                </p>
                <h3
                  id="print-checkout-title"
                  className="mt-1 font-display text-2xl font-bold text-night-800"
                >
                  Delivery estimate
                </h3>
                <p className="mt-1 text-sm leading-6 text-night-500">
                  Enter an Australian address to calculate shipping, then
                  continue to Stripe for secure payment.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close checkout"
                disabled={loading}
                onClick={() => setModalOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night-50 text-lg font-bold text-night-500 transition hover:bg-night-100 disabled:opacity-40"
              >
                X
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  Name
                </span>
                <input
                  value={shipping.name ?? ""}
                  onChange={(event) =>
                    updateShipping("name", event.target.value)
                  }
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-800 outline-none transition focus:border-moon-400"
                  autoComplete="name"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  Email
                </span>
                <input
                  value={shipping.email ?? ""}
                  onChange={(event) =>
                    updateShipping("email", event.target.value)
                  }
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-800 outline-none transition focus:border-moon-400"
                  autoComplete="email"
                  inputMode="email"
                />
              </label>
              <label className="relative space-y-1 sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  Address line 1
                </span>
                <input
                  value={shipping.line1}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 150);
                  }}
                  onChange={(event) => {
                    updateShipping("line1", event.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(suggestions.length > 0)}
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-800 outline-none transition focus:border-moon-400"
                  autoComplete="address-line1"
                  required
                />
                {showSuggestions && suggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-night-100 bg-white shadow-lg">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.placeId}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void selectSuggestion(suggestion)}
                        className="block w-full px-3 py-2 text-left text-sm transition hover:bg-moon-50"
                      >
                        <span className="block font-bold text-night-800">
                          {suggestion.mainText ?? suggestion.description}
                        </span>
                        {suggestion.secondaryText ? (
                          <span className="block text-xs text-night-500">
                            {suggestion.secondaryText}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                {addressLoading ? (
                  <span className="absolute right-3 top-8 text-xs font-bold text-night-400">
                    Finding...
                  </span>
                ) : null}
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  Address line 2
                </span>
                <input
                  value={shipping.line2 ?? ""}
                  onChange={(event) =>
                    updateShipping("line2", event.target.value)
                  }
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-800 outline-none transition focus:border-moon-400"
                  autoComplete="address-line2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  Suburb
                </span>
                <input
                  value={shipping.city}
                  onChange={(event) =>
                    updateShipping("city", event.target.value)
                  }
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-800 outline-none transition focus:border-moon-400"
                  autoComplete="address-level2"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  State
                </span>
                <input
                  value={shipping.state ?? ""}
                  onChange={(event) =>
                    updateShipping("state", event.target.value)
                  }
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-800 outline-none transition focus:border-moon-400"
                  autoComplete="address-level1"
                  maxLength={3}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  Postcode
                </span>
                <input
                  value={shipping.postalCode}
                  onChange={(event) =>
                    updateShipping("postalCode", event.target.value)
                  }
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-800 outline-none transition focus:border-moon-400"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                  Country
                </span>
                <input
                  value="Australia"
                  disabled
                  className="w-full rounded-lg border border-night-100 bg-white px-3 py-2 text-sm text-night-500"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-night-50 px-4 py-3">
              <span className="text-sm font-medium text-night-600">
                Quantity
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-night-700 shadow-sm transition hover:bg-night-100 disabled:opacity-30"
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <span className="w-5 text-center text-sm font-bold text-night-800">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  disabled={quantity >= 10}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-night-700 shadow-sm transition hover:bg-night-100 disabled:opacity-30"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between px-1 text-sm">
              <span className="text-night-400">
                {formatAud(priceAud)} x {quantity}
              </span>
              <span className="font-bold text-night-800">
                {formatAud(total)} before shipping
              </span>
            </div>

            {error ? (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="storycot-btn storycot-btn-primary mt-5 w-full"
            >
              {loading ? "Opening checkout..." : "Continue to secure checkout"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
