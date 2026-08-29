import { createFileRoute } from "@tanstack/react-router";
import { CampaignPage } from "@/components/joji/campaign-page";

export const Route = createFileRoute("/app/campaign")({
  head: () => ({
    meta: [
      { title: "Campaign Studio — JOJI" },
      { name: "description", content: "Create reviewable multilingual public-health campaign kits with JOJI." },
      { property: "og:title", content: "Campaign Studio — JOJI" },
      { property: "og:description", content: "One document into leaflets, radio, SMS and community scripts." },
    ],
  }),
  component: CampaignPage,
});