import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/joji/settings-page";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — JOJI" },
      {
        name: "description",
        content: "Manage your JOJI profile, organisation and language preference.",
      },
      { property: "og:title", content: "Settings — JOJI" },
      { property: "og:description", content: "Keep your JOJI workspace details up to date." },
    ],
  }),
  component: SettingsPage,
});
