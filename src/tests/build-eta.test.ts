import { describe, expect, it } from "vitest";
import {
  computeEtaSeconds,
  creepProgress,
  estimateFinalizeRemainingSeconds,
  formatBuildEta,
  formatElapsed,
  smoothEtaSeconds,
} from "@/lib/print-books/buildEta";

const T0 = Date.parse("2026-08-23T10:00:00.000Z");
const at = (secondsAfter: number) => T0 + secondsAfter * 1000;

describe("computeEtaSeconds", () => {
  it("returns null until at least two illustrations have completed", () => {
    expect(computeEtaSeconds([], 10, at(0))).toBeNull();
    expect(computeEtaSeconds([at(0)], 10, at(10))).toBeNull();
  });

  it("returns null when everything is already complete", () => {
    expect(computeEtaSeconds([at(0), at(5), at(10)], 3, at(10))).toBeNull();
  });

  it("estimates remaining time from throughput since the first completion", () => {
    // 3 done out of 12, first at t=0, measured 20s later => 2 images / 20s
    // = 0.1 img/s. 9 remaining => 90s.
    const eta = computeEtaSeconds([at(0), at(10), at(18)], 12, at(20));
    expect(eta).toBeCloseTo(90, 0);
  });

  it("ignores the heavy pre-first-completion time (cover/seed step)", () => {
    // Even though the cover took a long time before t=0, the rate is measured
    // only from the first completion onward, so the ETA reflects real cadence.
    const eta = computeEtaSeconds([at(0), at(6)], 6, at(6));
    // 2 done, 1 image measured over 6s => 0.1667 img/s; 4 remaining => 24s.
    expect(eta).toBeCloseTo(24, 0);
  });

  it("ignores non-finite timestamps defensively", () => {
    const eta = computeEtaSeconds([at(0), Number.NaN, at(10)], 12, at(10));
    // Only 2 valid completions => 1 image / 10s => 10 remaining => 100s.
    expect(eta).toBeCloseTo(100, 0);
  });
});

describe("smoothEtaSeconds", () => {
  it("adopts the first real estimate", () => {
    expect(smoothEtaSeconds(null, 120)).toBe(120);
  });

  it("keeps the previous value when the next estimate is missing", () => {
    expect(smoothEtaSeconds(90, null)).toBe(90);
  });

  it("blends toward a lower estimate (countdown glides down)", () => {
    // 100 * 0.6 + 60 * 0.4 = 84
    expect(smoothEtaSeconds(100, 60)).toBeCloseTo(84, 5);
  });

  it("does not tick upward on small rises (avoids a rising countdown)", () => {
    expect(smoothEtaSeconds(100, 110)).toBe(100);
  });

  it("allows a large jump up when the estimate roughly doubles (a stall/restart)", () => {
    // next (250) >= prev*2 (200) => blend applies: 100*0.6 + 250*0.4 = 160
    expect(smoothEtaSeconds(100, 250)).toBeCloseTo(160, 5);
  });
});

describe("formatBuildEta", () => {
  it("shows an estimating state before there is data", () => {
    expect(formatBuildEta(null)).toBe("Estimating time left…");
  });

  it("shows a finalizing message during the compose phase", () => {
    expect(formatBuildEta(42, "finalizing")).toBe("Adding final touches…");
    expect(formatBuildEta(null, "finalizing")).toBe("Adding final touches…");
  });

  it("uses friendly buckets for small and large values", () => {
    expect(formatBuildEta(5)).toBe("Almost done");
    expect(formatBuildEta(40)).toBe("Less than a minute left");
    expect(formatBuildEta(90)).toBe("About 2 minutes left");
    expect(formatBuildEta(61)).toBe("About 1 minute left");
  });
});

describe("formatElapsed", () => {
  it("formats seconds as M:SS", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9)).toBe("0:09");
    expect(formatElapsed(75)).toBe("1:15");
    expect(formatElapsed(600)).toBe("10:00");
  });

  it("clamps negatives to 0:00", () => {
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

describe("creepProgress", () => {
  it("starts at real progress and eases upward over time", () => {
    expect(creepProgress(0, 35)).toBe(35);
    const at30 = creepProgress(30, 35);
    const at90 = creepProgress(90, 35);
    expect(at30).toBeGreaterThan(35);
    expect(at90).toBeGreaterThan(at30);
  });

  it("never overtakes real progress once a batch lands", () => {
    // A big real jump should win over the time-based creep.
    expect(creepProgress(20, 78)).toBe(78);
  });

  it("is capped below 100 so it never claims completion", () => {
    expect(creepProgress(100000, 0)).toBeLessThanOrEqual(92);
  });

  it("is monotonic in elapsed time", () => {
    let prev = -1;
    for (let s = 0; s <= 300; s += 15) {
      const v = creepProgress(s, 0);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("estimateFinalizeRemainingSeconds", () => {
  it("scales the expected duration with page count", () => {
    // base 20 + 3/page
    expect(estimateFinalizeRemainingSeconds(0, 0)).toBe(20);
    expect(estimateFinalizeRemainingSeconds(10, 0)).toBe(50);
    expect(estimateFinalizeRemainingSeconds(24, 0)).toBe(92);
  });

  it("counts down as time elapses", () => {
    expect(estimateFinalizeRemainingSeconds(10, 20)).toBe(30);
    expect(estimateFinalizeRemainingSeconds(10, 45)).toBe(5);
  });

  it("floors at a small positive remaining so it never hits zero/negative", () => {
    expect(estimateFinalizeRemainingSeconds(10, 999)).toBe(5);
    expect(estimateFinalizeRemainingSeconds(10, 48)).toBe(5);
  });

  it("produces friendly buckets through formatBuildEta", () => {
    expect(formatBuildEta(estimateFinalizeRemainingSeconds(24, 0))).toBe(
      "About 2 minutes left"
    );
    expect(formatBuildEta(estimateFinalizeRemainingSeconds(10, 999))).toBe(
      "Almost done"
    );
  });
});
