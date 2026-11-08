import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import documentation from "@/routes/_authenticated/content/documentation.md?raw";

export const Route = createFileRoute("/_authenticated/documentation")({
  component: DocumentationPage,
});

function DocumentationPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <ReactMarkdown>{documentation}</ReactMarkdown>
      </article>
    </main>
  );
}
