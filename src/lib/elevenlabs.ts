export type NarrationVoice = {
  id: string;
  label: string;
};

export const NARRATION_VOICES: NarrationVoice[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam" },
];

export const DEFAULT_NARRATION_VOICE_ID = NARRATION_VOICES[0]!.id;

export function isNarrationConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function generateNarration(
  text: string,
  voiceId: string
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `ElevenLabs TTS failed (${response.status}): ${body.slice(0, 300)}`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
