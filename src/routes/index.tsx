import { createFileRoute } from "@tanstack/react-router";
import { Assistant } from "@/extension/Assistant";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lovable Chat Assistant 2.0 — Extensão para Chrome" },
      { name: "description", content: "Converse com modelos de IA, analise seu repositório GitHub, revise alterações e aplique commits com segurança." },
      { property: "og:title", content: "Lovable Chat Assistant 2.0" },
      { property: "og:description", content: "Assistente de programação para projetos Lovable com revisão de código e commits agrupados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Assistant,
});
