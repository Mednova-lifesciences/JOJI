import { createServerFn } from "@tanstack/react-start";
import { campaignWithAi, translateWithAi } from "./ai.server";
import { campaignInput, translateInput } from "./ai.schemas";

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => translateInput.parse(input))
  .handler(async ({ data }) => ({ translation: await translateWithAi(data.text, data.fromLang, data.toLang) }));

export const generateCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => campaignInput.parse(input))
  .handler(async ({ data }) => campaignWithAi(data.text, data.topic, data.audience));