import { z } from "zod";

export const translateInput = z.object({
  text: z.string().min(1).max(4000),
  fromLang: z.string().min(2).max(5),
  toLang: z.string().min(2).max(5),
});

export const campaignInput = z.object({
  text: z.string().min(20).max(12000),
  topic: z.string().max(200).optional(),
  audience: z.string().max(200).optional(),
});
