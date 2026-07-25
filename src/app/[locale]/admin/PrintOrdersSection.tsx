import type { PrintBookOrder, PrintFulfillment } from "@/types/printBook";

type PrintOrderRow = {
  id: string;
  userId: string;
  sourceStoryId: string;
  printOrder: PrintBookOrder;
  updatedAt: string;
};

function formatAuDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Adelaide",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatAud(amount: number): string {
  return amount.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

const ORDER_STATUS_STYLES: Record<PrintBookOrder["status"], string> = {
  checkout_started: "bg-night-100 text-night-500",
  paid: "bg-green-100 text-green-700",
  refunded: "bg-yellow-100 text-yellow-700",
};

const FULFILLMENT_STATUS_STYLES: Record<PrintFulfillment["status"], string> = {
  not_configured: "bg-night-100 text-night-400",
  ready_for_manual_review: "bg-yellow-100 text-yellow-700",
  submitted: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
  shipped: "bg-indigo-100 text-indigo-700",
  delivered: "bg-green-100 text-green-700",
};

function OrderStatusBadge({ status }: { status: PrintBookOrder["status"] }) {
  const styles = ORDER_STATUS_STYLES[status] ?? "bg-night-100 text-night-500";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${styles}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function FulfillmentBadge({ fulfillment }: { fulfillment?: PrintFulfillment }) {
  if (!fulfillment)
    return <span className="inline-block rounded-full bg-night-100 px-2 py-0.5 text-xs font-medium text-night-400">none</span>;
  const styles = FULFILLMENT_STATUS_STYLES[fulfillment.status] ?? "bg-night-100 text-night-500";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {fulfillment.status.replace(/_/g, " ")}
    </span>
  );
}

function OrderCard({ id, userId, printOrder: o }: PrintOrderRow) {
  const ship = o.shipping;
  const ful = o.fulfillment;
  return (
    <div className="rounded-xl border border-night-100 bg-night-50/50 p-4 space-y-3">
      {/* Header row: date + status badges */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-night-700">{formatAuDate(o.paidAt ?? o.checkoutStartedAt)}</p>
          <p className="font-mono text-xs text-night-400 mt-0.5">{id.slice(0, 14)}…</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={o.status} />
          <FulfillmentBadge fulfillment={ful} />
        </div>
      </div>

      {/* Customer */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-night-400 mb-0.5">Customer</p>
        {ship ? (
          <>
            <p className="text-sm font-medium text-night-700">{ship.name ?? "—"}</p>
            <p className="text-xs text-night-500">{ship.email ?? "—"}</p>
            {ship.line1 && (
              <p className="text-xs text-night-400">{[ship.line1, ship.city, ship.state, ship.postalCode].filter(Boolean).join(", ")}</p>
            )}
          </>
        ) : (
          <p className="font-mono text-xs text-night-400">user: {userId.slice(0, 14)}…</p>
        )}
      </div>

      {/* Product + amount */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-night-400 mb-0.5">Product</p>
          <p className="text-sm text-night-700">{o.productLabel}</p>
          <p className="text-xs text-night-400">
            {o.pageCount}pp{o.quantity && o.quantity > 1 ? ` × ${o.quantity} copies` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-night-400 mb-0.5">Amount</p>
          <p className="text-sm font-bold text-night-800">{formatAud(o.amountAud)}</p>
        </div>
      </div>

      {/* Fulfillment ref + tracking */}
      {(ful?.externalOrderId || ful?.trackingUrl) && (
        <div>
          {ful.externalOrderId && (
            <p className="font-mono text-xs text-night-400">Ref: {ful.externalOrderId}</p>
          )}
          {ful.trackingUrl && (
            <a
              href={ful.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
            >
              Track parcel ({ful.carrier ?? "carrier"})
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function PrintOrdersSection({ orders }: { orders: PrintOrderRow[] }) {
  return (
    <div className="rounded-2xl border border-night-100 bg-white p-4 sm:p-6 shadow-sm mb-6">
      <h2 className="font-display text-xl font-bold text-night-800 mb-1">Print Orders</h2>
      <p className="text-sm text-night-400 mb-5">
        {orders.length} order{orders.length !== 1 ? "s" : ""} (most recent first)
      </p>

      {orders.length === 0 ? (
        <p className="text-center text-night-400 py-6">No print orders yet.</p>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {orders.map((row) => <OrderCard key={row.id} {...row} />)}
          </div>

          {/* sm+: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-night-100 text-left text-xs font-bold uppercase tracking-wide text-night-400">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Product</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Fulfillment</th>
                  <th className="pb-2">Ref / Track</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-50">
                {orders.map(({ id, userId, printOrder: o }) => {
                  const ship = o.shipping;
                  const ful = o.fulfillment;
                  return (
                    <tr key={id} className="align-top">
                      <td className="py-3 pr-4">
                        <p className="text-night-700 whitespace-nowrap">{formatAuDate(o.paidAt ?? o.checkoutStartedAt)}</p>
                        <p className="font-mono text-xs text-night-400 mt-0.5">{id.slice(0, 12)}…</p>
                      </td>
                      <td className="py-3 pr-4">
                        {ship ? (
                          <>
                            <p className="text-night-700 font-medium">{ship.name ?? "—"}</p>
                            <p className="text-night-400 text-xs">{ship.email ?? "—"}</p>
                          </>
                        ) : (
                          <p className="text-night-400 font-mono text-xs">user: {userId.slice(0, 12)}…</p>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-night-700">{o.productLabel}</p>
                        <p className="text-xs text-night-400">
                          {o.pageCount}pp{o.quantity && o.quantity > 1 ? ` × ${o.quantity}` : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-medium text-night-700">{formatAud(o.amountAud)}</td>
                      <td className="py-3 pr-4"><OrderStatusBadge status={o.status} /></td>
                      <td className="py-3 pr-4">
                        <FulfillmentBadge fulfillment={ful} />
                        {ful?.externalOrderId && (
                          <p className="font-mono text-xs text-night-400 mt-1">{ful.externalOrderId}</p>
                        )}
                      </td>
                      <td className="py-3">
                        {ful?.trackingUrl ? (
                          <a href={ful.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline hover:text-blue-800">
                            Track ({ful.carrier ?? "carrier"})
                          </a>
                        ) : (
                          <span className="text-xs text-night-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
