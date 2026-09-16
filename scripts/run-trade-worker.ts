import { handleTradeBookJob } from "../src/lib/trade-books/handlers";
import { runTradeBookWorkerCycle } from "../src/lib/trade-books/worker";

async function main() {
  const outcome = await runTradeBookWorkerCycle(handleTradeBookJob);
  console.log(`trade-worker outcome=${outcome}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown worker error";
  console.error(`trade-worker failed: ${message}`);
  process.exitCode = 1;
});
