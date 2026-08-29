import { createFileRoute } from "@tanstack/react-router";
import { TranslatePage } from "@/components/joji/translate-page";

export const Route = createFileRoute("/app/translate")({
  head: () => ({
    meta: [
      { title: "Translate — JOJI" },
      { name: "description", content: "Translate patient-doctor conversations across Nigerian languages in real time." },
      { property: "og:title", content: "Translate — JOJI" },
      { property: "og:description", content: "Live bilingual communication for Nigerian healthcare teams." },
    ],
  }),
  component: TranslatePage,
});