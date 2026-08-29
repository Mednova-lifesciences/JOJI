import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { campaignWithAi, translateWithAi } from "./ai.server";

const translateInput = z.object({
  text: z.string().min(1).max(4000),
  fromLang: z.string().min(2).max(5),
  toLang: z.string().min(2).max(5),
});

const campaignInput = z.object({
  text: z.string().min(20).max(12000),
  topic: z.string().max(200).optional(),
  audience: z.string().max(200).optional(),
});

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => translateInput.parse(input))
  .handler(async ({ data }) => ({ translation: await translateWithAi(data.text, data.fromLang, data.toLang) }));

export const generateCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => campaignInput.parse(input))
  .handler(async ({ data }) => campaignWithAi(data.text, data.topic, data.audience));