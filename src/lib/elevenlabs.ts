export type NarrationVoice = {
  id: string;
  label: string;
};

export type WordTiming = {
  word: string;
  start: number;
  end: number;
};

export type NarrationResult = {
  audio: Buffer;
  words: WordTiming[];
};

export const NARRATION_VOICES: NarrationVoice[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George" },
  { id: "cgSgspJ2msm6clMCkdW9", label: "Jessica" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah" },
];

export const DEFAULT_NARRATION_VOICE_ID = NARRATION_VOICES[0]!.id;

export function isNarrationConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function groupCharactersToWords(alignment: {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}): WordTiming[] {
  const words: WordTiming[] = [];
  let current = "";
  let wordStart = 0;

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i]!;
    const isSpace = char === " " || char === "\n";

    if (isSpace) {
      if (current) {
        words.push({
          word: current,
          start: wordStart,
          end: alignment.character_end_times_seconds[i - 1] ?? wordStart,
        });
        current = "";
      }
    } else {
      if (!current) wordStart = alignment.character_start_times_seconds[i] ?? 0;
      current += char;
    }
  }

  if (current) {
    words.push({
      word: current,
      start: wordStart,
      end: alignment.character_end_times_seconds[alignment.characters.length - 1] ?? wordStart,
    });
  }

  return words;
}

export async function generateNarration(
  text: string,
  voiceId: string
): Promise<NarrationResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
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

  const data = (await response.json()) as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  return {
    audio: Buffer.from(data.audio_base64, "base64"),
    words: groupCharactersToWords(data.alignment),
  };
}
