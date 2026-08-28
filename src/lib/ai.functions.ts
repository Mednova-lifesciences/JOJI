/**
 * Server functions backing the Translate and Campaign Studio modules.
 *
 * These call the Lovable AI Gateway (OpenAI-compatible chat completions) from
 * the server so no API key ever reaches the browser. To swap in your own
 * OpenAI key, change the baseUrl to https://api.openai.com/v1 and the auth
 * header to `Bearer ${process.env.OPENAI_API_KEY}` inside `callModel`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MODEL = "google/gemini-3.7-flash";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  yo: "Yorùbá",
  ig: "Igbo",
  ha: "Hausa",
  pcm: "Nigerian Pidgin",
};

async function callModel(system: string, user: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured on this server.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Too many requests right now. Please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace. Please top up to continue.");
    throw new Error(`AI request failed (${res.status}). ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("The model returned an empty response.");
  return content;
}

/* -------------------------------- translate ------------------------------- */

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        fromLang: z.string().min(2).max(5),
        toLang: z.string().min(2).max(5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const target = LANGUAGE_NAMES[data.toLang] ?? data.toLang;
    const source = LANGUAGE_NAMES[data.fromLang] ?? data.fromLang;

    const system =
      `You are JOJI, a medical translation assistant for Nigerian languages. ` +
      `Translate the following health text accurately from ${source} into ${target} using plain, ` +
      `everyday phrasing. Preserve medical meaning but avoid jargon. Return ONLY the translation, ` +
      `with no quotes, notes, or explanations.`;

    const translation = await callModel(system, data.text);
    return { translation };
  });

/* -------------------------------- campaign -------------------------------- */

const CampaignInput = z.object({
  text: z.string().min(20).max(12000),
  topic: z.string().max(200).optional(),
  audience: z.string().max(200).optional(),
});

export type CampaignKit = {
  leaflets: { language: string; body: string }[];
  radioScript: string;
  whatsapp: string;
  sms: string;
  facebook: string;
  chwScript: string;
};

export const generateCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CampaignInput.parse(input))
  .handler(async ({ data }): Promise<CampaignKit> => {
    const system =
      `You are JOJI, a Nigerian public-health communication assistant built by MedNova Lifesciences. ` +
      `Turn the supplied source material into a multilingual campaign kit for Nigerian communities. ` +
      `Use plain, warm, culturally appropriate language. Preserve medical meaning, avoid jargon. ` +
      `Respond with STRICT JSON only (no markdown fences) matching exactly this shape: ` +
      `{"leaflets":[{"language":"Yorùbá","body":"..."},{"language":"Igbo","body":"..."},` +
      `{"language":"Hausa","body":"..."},{"language":"Nigerian Pidgin","body":"..."}],` +
      `"radioScript":"...","whatsapp":"...","sms":"...","facebook":"...","chwScript":"..."}. ` +
      `Leaflets must be fully written in their stated language (title, 3-5 key points, call to action). ` +
      `radioScript, whatsapp, facebook and chwScript are in English. sms is English and under 160 characters.`;

    const user = [
      data.topic ? `Topic: ${data.topic}` : null,
      data.audience ? `Audience: ${data.audience}` : null,
      "Source material:",
      data.text,
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await callModel(system, user);
    const cleaned = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    try {
      return JSON.parse(cleaned) as CampaignKit;
    } catch {
      throw new Error("The model returned an unexpected format. Please try generating again.");
    }
  });
