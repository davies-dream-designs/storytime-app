import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookReader from "@/app/[locale]/books/[id]/BookReader";
import type { BookProject } from "@/types/printBook";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span aria-label={alt} />,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values ? `${key} ${Object.values(values).join("/")}` : key,
}));

class MockAudio {
  static instances: MockAudio[] = [];

  currentTime = 0;
  ended = false;
  preload = "";
  private listeners = new Map<string, Set<() => void>>();
  private source = "";

  constructor(src?: string) {
    if (src) this.source = src;
    MockAudio.instances.push(this);
  }

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    this.ended = false;
  }

  play = vi.fn(async () => {
    this.ended = false;
  });

  pause = vi.fn();
  load = vi.fn();

  removeAttribute(name: string) {
    if (name === "src") this.source = "";
  }

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emitEnded() {
    this.ended = true;
    for (const listener of this.listeners.get("ended") ?? []) listener();
  }
}

function projectWithTwoTextSpreads(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "ready",
    trimSize: "8.5x8.5",
    pageCount: 24,
    spreadCount: 2,
    completedSpreads: 2,
    totalSpreads: 2,
    currentStageLabel: "Ready",
    beats: [],
    spreads: [
      {
        id: "spread-1",
        bookProjectId: "book-1",
        sequence: 1,
        pageStart: 1,
        pageEnd: 2,
        layoutType: "text_art",
        title: "First",
        leftPageText: "First page left.",
        rightPageText: "First page right.",
        sceneBrief: "",
        illustrationPrompt: "",
        imageUrl: "https://example.com/first.jpg",
      },
      {
        id: "spread-2",
        bookProjectId: "book-1",
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "text_art",
        title: "Second",
        leftPageText: "Second page left.",
        rightPageText: "Second page right.",
        sceneBrief: "",
        illustrationPrompt: "",
        imageUrl: "https://example.com/second.jpg",
      },
    ],
    assets: {
      digitalDownloadUnlockedAt: "2026-07-30T00:00:00.000Z",
      proofVersion: 1,
    },
    retryCount: 0,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
}

function projectWithMixedSpreads(): BookProject {
  const project = projectWithTwoTextSpreads();
  return {
    ...project,
    spreadCount: 3,
    completedSpreads: 3,
    totalSpreads: 3,
    spreads: [
      project.spreads[0]!,
      {
        id: "spread-text-only",
        bookProjectId: "book-1",
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "text_only",
        title: "Quiet page",
        leftPageText: "This is a longer reading beat without its own art.",
        rightPageText: "",
        sceneBrief: "",
        illustrationPrompt: "",
      },
      {
        ...project.spreads[1]!,
        sequence: 3,
      },
    ],
  };
}

describe("BookReader narration", () => {
  beforeEach(() => {
    MockAudio.instances = [];
    vi.stubGlobal("Audio", MockAudio);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const spreadId = new URL(url, "https://storycot.test").searchParams.get(
          "spreadId"
        );
        return new Response(
          JSON.stringify({
            audioUrl: `https://audio.test/${spreadId}.mp3`,
            words: [{ word: spreadId ?? "word", start: 0, end: 0.5 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("continues narration when a page finishes and advances", async () => {
    render(<BookReader project={projectWithTwoTextSpreads()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "listenToStory",
      })
    );

    await waitFor(() => {
      expect(MockAudio.instances[0]?.play).toHaveBeenCalledTimes(1);
    });

    act(() => {
      MockAudio.instances[0]!.emitEnded();
    });

    await screen.findByText("pageOf 2/2");
    await waitFor(() => {
      expect(MockAudio.instances[0]?.play).toHaveBeenCalledTimes(2);
    });

    expect(MockAudio.instances[0]?.src).toBe(
      "https://audio.test/spread-2.mp3"
    );
  });

  it("shows text-only spreads in fullscreen without a missing-illustration panel", async () => {
    render(<BookReader project={projectWithMixedSpreads()} />);

    fireEvent.click(screen.getByLabelText("viewFullScreen"));
    fireEvent.click(screen.getAllByLabelText("nextPage")[0]!);

    expect(
      screen.getAllByText("This is a longer reading beat without its own art.")
        .length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("noIllustration")).not.toBeInTheDocument();
    expect(screen.queryByText("illustrationComingSoon")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("previousPage").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("nextPage").length).toBeGreaterThan(0);
  });
});
