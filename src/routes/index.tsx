import { createFileRoute } from "@tanstack/react-router";
import { FormaApp } from "@/components/forma/app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <FormaApp />;
}
