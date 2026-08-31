import { createServerFn } from "@tanstack/react-start";
import { campaignWithAi, transcribeWithAi, translateWithAi } from "./ai.server";
import { campaignInput, translateInput } from "./ai.schemas";

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => translateInput.parse(input))
  .handler(async ({ data }) => ({
    translation: await translateWithAi(data.text, data.fromLang, data.toLang),
  }));

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Expected FormData");
    const audio = input.get("audio");
    if (!(audio instanceof Blob)) throw new Error("Missing audio file");
    const lang = input.get("lang");
    return { audio, lang: typeof lang === "string" ? lang : undefined };
  })
  .handler(async ({ data }) => ({
    text: await transcribeWithAi(data.audio, data.lang),
  }));

export const generateCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => campaignInput.parse(input))
  .handler(async ({ data }) => campaignWithAi(data.text, data.topic, data.audience));
