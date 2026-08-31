import { createFileRoute } from "@tanstack/react-router";
import { MaternalPage } from "@/components/joji/maternal-page";

export const Route = createFileRoute("/app/maternal")({
  head: () => ({
    meta: [
      { title: "Maternal Health — JOJI" },
      {
        name: "description",
        content:
          "Practical maternal, postpartum, cycle and immunisation estimates for health workers.",
      },
      { property: "og:title", content: "Maternal Health — JOJI" },
      {
        property: "og:description",
        content: "Accessible maternal and child health tools for Nigerian care teams.",
      },
    ],
  }),
  component: MaternalPage,
});
