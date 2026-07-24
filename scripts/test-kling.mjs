#!/usr/bin/env node
// Quick test: animate one Storycot illustration with Kling via fal.ai
// Usage: FAL_KEY=your_key node scripts/test-kling.mjs <image-url>
//
// Get a free FAL_KEY at fal.ai — grab an image URL by right-clicking
// any illustration in a finished Storycot book and copying the image address.

const imageUrl = process.argv[2];
const falKey = process.env.FAL_KEY;

if (!imageUrl || !falKey) {
  console.error("Usage: FAL_KEY=your_key node scripts/test-kling.mjs <image-url>");
  process.exit(1);
}

// Gentle bedtime motion prompt — no cuts, single continuous shot
const prompt =
  "Gentle children's book illustration coming alive. Soft warm light flickering, " +
  "character breathing slowly, leaves drifting in a light breeze, magical cozy atmosphere. " +
  "Slow gentle movement, calm and dreamy. Single continuous shot, no cuts, no camera change, no scene transition.";

console.log("Submitting to Kling 2.1 via fal.ai...");
console.log("Image:", imageUrl);
console.log("Prompt:", prompt);
console.log("");

// Submit the job
const submitRes = await fetch(
  "https://queue.fal.run/fal-ai/kling-video/v2.1/standard/image-to-video",
  {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      duration: "5",   // fal.ai Kling only supports "5" or "10" — use 5 for testing
      aspect_ratio: "1:1",
    }),
  }
);

if (!submitRes.ok) {
  const err = await submitRes.text();
  console.error("Submit failed:", submitRes.status, err);
  process.exit(1);
}

const { request_id } = await submitRes.json();
console.log("Job submitted. Request ID:", request_id);
console.log("Polling for result (usually 60-120 seconds)...");

// Poll until done
const statusUrl = `https://queue.fal.run/fal-ai/kling-video/v2.1/standard/image-to-video/requests/${request_id}`;

let attempts = 0;
while (attempts < 60) {
  await new Promise((r) => setTimeout(r, 5000));
  attempts++;

  const statusRes = await fetch(statusUrl, {
    headers: { Authorization: `Key ${falKey}` },
  });
  const status = await statusRes.json();

  if (status.status === "COMPLETED") {
    const videoUrl = status.output?.video?.url;
    console.log("\nDone!");
    console.log("Video URL:", videoUrl);
    console.log("\nOpen that URL in your browser to preview the clip.");
    break;
  }

  if (status.status === "FAILED") {
    console.error("Job failed:", status.error);
    process.exit(1);
  }

  process.stdout.write(`  [${attempts * 5}s] Status: ${status.status}...\r`);
}
