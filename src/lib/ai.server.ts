import type { CampaignKit } from "./ai.types";

const MODEL = "gpt-4o-mini";
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  yo: "Yorùbá",
  ig: "Igbo",
  ha: "Hausa",
  pcm: "Nigerian Pidgin",
};

type ResponseEvent = {
  type?: string;
  delta?: string;
  response?: { output_text?: string };
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseText(response: Response) {
  if (!response.body) throw new Error("The AI service returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const event = JSON.parse(payload) as ResponseEvent;
      if (event.type === "response.output_text.delta") output += event.delta ?? "";
      if (event.type === "response.completed" && !output)
        output = event.response?.output_text ?? "";
    } catch {
      // Ignore non-JSON keep-alive lines in the SSE stream.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
    if (done) break;
  }
  consume(buffer);
  return output.trim();
}

async function callModel(instructions: string, input: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured on this server.");

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
        stream: true,
        store: false,
      }),
    });
    if (response.ok) break;
    if (response.status !== 429 && response.status < 500) break;
    if (attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      await wait(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 700 * 2 ** attempt,
      );
    }
  }

  if (!response?.ok) {
    const body = await response?.text().catch(() => "");
    if (response?.status === 429)
      throw new Error("Too many AI requests right now. Please wait a moment and try again.");
    if (response?.status === 402)
      throw new Error(body || "AI credits are exhausted. Please top up your OpenAI account.");
    if (response?.status === 403)
      throw new Error(body || "AI access is blocked. Please check your OpenAI account status.");
    throw new Error(
      `AI request failed (${response?.status ?? "unknown"}). ${body?.slice(0, 200) ?? ""}`,
    );
  }

  const content = await readResponseText(response);
  if (!content) throw new Error("The AI service returned an empty response.");
  return content;
}

const TRANSCRIBE_LANGUAGE_HINTS: Record<string, string> = {
  en: "en",
  yo: "yo",
  ig: "ig",
  ha: "ha",
};

export async function transcribeWithAi(audio: Blob, lang?: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured on this server.");

  const form = new FormData();
  const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("file", audio, `chunk.${ext}`);
  form.append("model", "gpt-4o-mini-transcribe");
  const hint = lang ? TRANSCRIBE_LANGUAGE_HINTS[lang] : undefined;
  if (hint) form.append("language", hint);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 429)
      throw new Error("Too many AI requests right now. Please wait a moment and try again.");
    if (response.status === 402)
      throw new Error(body || "AI credits are exhausted. Please top up your OpenAI account.");
    throw new Error(`Transcription failed (${response.status}). ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as { text?: string };
  return (json.text ?? "").trim();
}

export async function translateWithAi(text: string, fromLang: string, toLang: string) {
  const target = LANGUAGE_NAMES[toLang] ?? toLang;
  const source = LANGUAGE_NAMES[fromLang] ?? fromLang;
  return callModel(
    `You are JOJI, a medical translation assistant for Nigerian languages. Translate health text accurately from ${source} into ${target} using plain, everyday phrasing. Preserve medical meaning, avoid jargon, and return only the translation.`,
    text,
  );
}

export async function campaignWithAi(
  text: string,
  topic?: string,
  audience?: string,
): Promise<CampaignKit> {
  const raw = await callModel(
    `You are JOJI, a Nigerian public-health communication assistant built by MedNova Lifesciences. Turn source material into a multilingual campaign kit. Use plain, warm, culturally appropriate language and preserve medical meaning. Return only valid JSON with exactly this shape: {"leaflets":[{"language":"Yorùbá","body":"..."},{"language":"Igbo","body":"..."},{"language":"Hausa","body":"..."},{"language":"Nigerian Pidgin","body":"..."}],"radioScript":"...","whatsapp":"...","sms":"...","facebook":"...","chwScript":"..."}. Write each leaflet fully in its stated language, including a title, 3-5 key points and a call to action. Write the other fields in English, with sms under 160 characters.`,
    [
      topic ? `Topic: ${topic}` : "",
      audience ? `Audience: ${audience}` : "",
      "Source material:",
      text,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as CampaignKit;
  } catch {
    throw new Error("The AI service returned an unexpected campaign format. Please try again.");
  }
}
