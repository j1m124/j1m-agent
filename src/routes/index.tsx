import { createFileRoute } from "@tanstack/react-router";
import { ChatApp } from "../client/components/ChatApp";

export const Route = createFileRoute("/")({
  component: ChatApp,
});
