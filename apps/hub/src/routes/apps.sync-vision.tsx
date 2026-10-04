import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/apps/sync-vision")({
  beforeLoad: () => {
    throw redirect({ to: "/apps/sync_vision" });
  },
  component: () => null,
});
