import { createFileRoute } from "@tanstack/react-router";
import { FlowStudio } from "@/components/flow-studio";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <FlowStudio />;
}
