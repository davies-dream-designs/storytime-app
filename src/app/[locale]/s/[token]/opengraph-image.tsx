import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getSharedStoryByToken } from "@/lib/sharedStory";

export const runtime = "nodejs";
export const alt = "Storycot shared story";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await getSharedStoryByToken(token);
  if (!shared) notFound();

  const imageUrl =
    shared.coverImageUrl ??
    shared.spreads.find((spread) => spread.imageUrl)?.imageUrl;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#17122f",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          style={{
            width: 560,
            height: 630,
            objectFit: "cover",
          }}
        />
      ) : null}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: imageUrl ? "64px 72px" : "72px 96px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#f8dc7a",
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          <span>Storycot</span>
        </div>
        <div
          style={{
            marginTop: 34,
            fontSize: 64,
            lineHeight: 1.02,
            fontWeight: 900,
            letterSpacing: 0,
          }}
        >
          {shared.story.title}
        </div>
        <div
          style={{
            marginTop: 26,
            color: "#d9d4f1",
            fontSize: 30,
            lineHeight: 1.25,
          }}
        >
          A personalised bedtime story for {shared.story.profileName}
        </div>
        <div
          style={{
            marginTop: 42,
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "#f8dc7a",
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          <span>storycot.com</span>
        </div>
      </div>
    </div>,
    size
  );
}
