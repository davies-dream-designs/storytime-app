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

const FULFILLMENT_STATUS_STYLES: Record<
  PrintFulfillment["status"],
  string
> = {
  not_configured: "bg-night-100 text-night-400",
  ready_for_manual_review: "bg-yellow-100 text-yellow-700",
  submitted: "bg-blue-100 text-blue-700",
  failed: "bg-blush-100 text-blush-700",
  shipped: "bg-indigo-100 text-indigo-700",
  delivered: "bg-green-100 text-green-700",
};

function FulfillmentBadge({
  fulfillment,
}: {
  fulfillment?: PrintFulfillment;
}) {
  if (!fulfillment) {
    return (
      <span className="inline-block rounded-full bg-night-100 px-2 py-0.5 text-xs font-medium text-night-400">
        none
      </span>
    );
  }
  const styles =
    FULFILLMENT_STATUS_STYLES[fulfillment.status] ??
    "bg-night-100 text-night-500";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {fulfillment.status.replace(/_/g, " ")}
    </span>
  );
}

function OrderStatusBadge({ status }: { status: PrintBookOrder["status"] }) {
  const styles =
    ORDER_STATUS_STYLES[status] ?? "bg-night-100 text-night-500";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${styles}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function PrintOrdersSection({
  orders,
}: {
  orders: PrintOrderRow[];
}) {
  return (
    <div className="rounded-2xl border border-night-100 bg-white p-6 shadow-sm mb-6">
      <h2 className="font-display text-xl font-bold text-night-800 mb-1">
        Print Orders
      </h2>
      <p className="text-sm text-night-400 mb-5">
        {orders.length} order{orders.length !== 1 ? "s" : ""} with a print_order record (most recent first)
      </p>

      {orders.length === 0 ? (
        <p className="text-center text-night-400 py-6">No print orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-night-100 text-left text-xs font-bold uppercase tracking-wide text-night-400">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4">Product</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Order status</th>
                <th className="pb-2 pr-4">Fulfillment</th>
                <th className="pb-2">Ref / Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night-50">
              {orders.map(({ id, userId, printOrder }) => {
                const o = printOrder;
                const ship = o.shipping;
                const ful = o.fulfillment;
                return (
                  <tr key={id} className="align-top">
                    <td className="py-3 pr-4">
                      <p className="text-night-700 whitespace-nowrap">
                        {formatAuDate(o.paidAt ?? o.checkoutStartedAt)}
                      </p>
                      <p className="font-mono text-xs text-night-400 mt-0.5 whitespace-nowrap">
                        {id.slice(0, 12)}&hellip;
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      {ship ? (
                        <>
                          <p className="text-night-700 font-medium">
                            {ship.name ?? "—"}
                          </p>
                          <p className="text-night-400 text-xs">
                            {ship.email ?? "—"}
                          </p>
                        </>
                      ) : (
                        <p className="text-night-400 font-mono text-xs">
                          user: {userId.slice(0, 12)}&hellip;
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-night-700">{o.productLabel}</p>
                      <p className="text-xs text-night-400">
                        {o.pageCount}pp
                        {o.quantity && o.quantity > 1
                          ? ` × ${o.quantity}`
                          : ""}
                      </p>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-medium text-night-700">
                      {formatAud(o.amountAud)}
                    </td>
                    <td className="py-3 pr-4">
                      <OrderStatusBadge status={o.status} />
                      {o.refundedAt && (
                        <p className="text-xs text-night-400 mt-1">
                          {formatAuDate(o.refundedAt)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <FulfillmentBadge fulfillment={ful} />
                      {ful?.externalOrderId && (
                        <p className="font-mono text-xs text-night-400 mt-1">
                          {ful.externalOrderId}
                        </p>
                      )}
                    </td>
                    <td className="py-3">
                      {ful?.trackingUrl ? (
                        <a
                          href={ful.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 underline hover:text-blue-800"
                        >
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
      )}
    </div>
  );
}
