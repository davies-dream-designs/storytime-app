import { PDFDocument, rgb } from "pdf-lib";
import type { Story } from "@/types";
import { clampText } from "./text";

export type PlaceholderTheme = {
  sky: ReturnType<typeof rgb>;
  skyAccent: ReturnType<typeof rgb>;
  ground: ReturnType<typeof rgb>;
  groundAccent: ReturnType<typeof rgb>;
  moon: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  paper: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  motif: "ocean" | "garden" | "night" | "adventure";
};

export type PlaceholderVariant = 0 | 1 | 2;

export function pickPlaceholderTheme(story: Story): PlaceholderTheme {
  const source =
    `${story.title} ${story.theme || ""} ${story.pages.map((page) => page.text).join(" ")} ${story.pages.map((page) => page.illustrationPrompt || "").join(" ")}`.toLowerCase();

  if (/(wave|ocean|sea|beach|shore|sand|pebble|shell|tide)/.test(source)) {
    return {
      sky: rgb(0.14, 0.2, 0.41),
      skyAccent: rgb(0.36, 0.38, 0.66),
      ground: rgb(0.15, 0.31, 0.54),
      groundAccent: rgb(0.1, 0.21, 0.39),
      moon: rgb(0.99, 0.94, 0.74),
      ink: rgb(0.15, 0.18, 0.24),
      paper: rgb(1, 0.99, 0.97),
      accent: rgb(0.96, 0.8, 0.41),
      motif: "ocean",
    };
  }

  if (
    /(garden|flower|forest|tree|leaf|meadow|field|fox|rabbit|bunny)/.test(
      source
    )
  ) {
    return {
      sky: rgb(0.18, 0.29, 0.34),
      skyAccent: rgb(0.39, 0.52, 0.43),
      ground: rgb(0.21, 0.38, 0.28),
      groundAccent: rgb(0.16, 0.28, 0.21),
      moon: rgb(0.98, 0.94, 0.75),
      ink: rgb(0.15, 0.18, 0.2),
      paper: rgb(1, 0.99, 0.97),
      accent: rgb(0.95, 0.79, 0.41),
      motif: "garden",
    };
  }

  if (/(moon|star|night|sleep|dream|sky|cloud)/.test(source)) {
    return {
      sky: rgb(0.13, 0.15, 0.33),
      skyAccent: rgb(0.32, 0.35, 0.62),
      ground: rgb(0.18, 0.28, 0.49),
      groundAccent: rgb(0.12, 0.2, 0.37),
      moon: rgb(1, 0.95, 0.78),
      ink: rgb(0.15, 0.17, 0.23),
      paper: rgb(1, 0.99, 0.97),
      accent: rgb(0.96, 0.81, 0.42),
      motif: "night",
    };
  }

  return {
    sky: rgb(0.17, 0.21, 0.42),
    skyAccent: rgb(0.4, 0.37, 0.67),
    ground: rgb(0.18, 0.29, 0.52),
    groundAccent: rgb(0.12, 0.2, 0.37),
    moon: rgb(0.99, 0.94, 0.76),
    ink: rgb(0.15, 0.18, 0.24),
    paper: rgb(1, 0.99, 0.97),
    accent: rgb(0.96, 0.8, 0.42),
    motif: "adventure",
  };
}

export function getPlaceholderVariant(seed: number): PlaceholderVariant {
  return (Math.abs(seed) % 3) as PlaceholderVariant;
}

export function drawPageBackground(
  page: ReturnType<PDFDocument["addPage"]>,
  width: number,
  height: number,
  color = rgb(1, 0.99, 0.97)
) {
  page.drawRectangle({ x: 0, y: 0, width, height, color });
}

export function drawThemeArtPanel(input: {
  page: ReturnType<PDFDocument["addPage"]>;
  rect: { x: number; y: number; width: number; height: number };
  theme: PlaceholderTheme;
  variant?: PlaceholderVariant;
  title?: string;
  subtitle?: string;
}) {
  const { page, rect, theme, title, subtitle, variant = 0 } = input;
  const moonX = variant === 0 ? 0.82 : variant === 1 ? 0.24 : 0.68;
  const moonY = variant === 0 ? 0.84 : variant === 1 ? 0.76 : 0.88;
  const ridgeOneX = variant === 0 ? 0.25 : variant === 1 ? 0.35 : 0.18;
  const ridgeTwoX = variant === 0 ? 0.7 : variant === 1 ? 0.63 : 0.78;
  const ridgeThreeX = variant === 0 ? 0.5 : variant === 1 ? 0.42 : 0.6;
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: theme.sky,
  });
  page.drawRectangle({
    x: rect.x,
    y: rect.y + rect.height * 0.32,
    width: rect.width,
    height: rect.height * 0.68,
    color: theme.skyAccent,
    opacity: 0.35,
  });
  page.drawCircle({
    x: rect.x + rect.width * moonX,
    y: rect.y + rect.height * moonY,
    size: Math.min(rect.width, rect.height) * 0.1,
    color: theme.moon,
    opacity: 0.95,
  });
  page.drawEllipse({
    x: rect.x + rect.width * ridgeOneX,
    y: rect.y + rect.height * 0.12,
    xScale: rect.width * 0.34,
    yScale: rect.height * 0.1,
    color: theme.ground,
  });
  page.drawEllipse({
    x: rect.x + rect.width * ridgeTwoX,
    y: rect.y + rect.height * 0.08,
    xScale: rect.width * 0.38,
    yScale: rect.height * 0.12,
    color: theme.groundAccent,
  });
  page.drawEllipse({
    x: rect.x + rect.width * ridgeThreeX,
    y: rect.y + rect.height * 0.02,
    xScale: rect.width * 0.5,
    yScale: rect.height * 0.08,
    color: theme.groundAccent,
    opacity: 0.95,
  });

  if (theme.motif === "ocean") {
    page.drawCircle({
      x: rect.x + rect.width * 0.42,
      y: rect.y + rect.height * 0.2,
      size: rect.width * 0.022,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.5,
      y: rect.y + rect.height * 0.24,
      size: rect.width * 0.016,
      color: theme.paper,
      opacity: 0.78,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.57,
      y: rect.y + rect.height * 0.19,
      size: rect.width * 0.024,
      color: theme.accent,
      opacity: 0.82,
    });
  } else if (theme.motif === "garden") {
    page.drawCircle({
      x: rect.x + rect.width * 0.48,
      y: rect.y + rect.height * 0.23,
      size: rect.width * 0.03,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.55,
      y: rect.y + rect.height * 0.23,
      size: rect.width * 0.03,
      color: theme.accent,
      opacity: 0.86,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.515,
      y: rect.y + rect.height * 0.29,
      size: rect.width * 0.025,
      color: theme.paper,
      opacity: 0.82,
    });
  } else if (theme.motif === "night") {
    page.drawCircle({
      x: rect.x + rect.width * 0.46,
      y: rect.y + rect.height * 0.24,
      size: rect.width * 0.024,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.53,
      y: rect.y + rect.height * 0.28,
      size: rect.width * 0.016,
      color: theme.paper,
      opacity: 0.82,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.58,
      y: rect.y + rect.height * 0.22,
      size: rect.width * 0.014,
      color: theme.accent,
      opacity: 0.82,
    });
  } else {
    page.drawCircle({
      x: rect.x + rect.width * 0.46,
      y: rect.y + rect.height * 0.17,
      size: rect.width * 0.024,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.62,
      y: rect.y + rect.height * 0.26,
      size: rect.width * 0.014,
      color: theme.paper,
      opacity: 0.82,
    });
  }

  if (title) {
    page.drawText(clampText(title, 42), {
      x: rect.x + 28,
      y: rect.y + rect.height - 48,
      size: 22,
      color: theme.paper,
    });
  }

  if (subtitle) {
    page.drawText(clampText(subtitle, 48), {
      x: rect.x + 28,
      y: rect.y + rect.height - 76,
      size: 12,
      color: theme.paper,
    });
  }
}
