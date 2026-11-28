import { createRelatonApi } from "@relaton/api";
import type { Env } from "@relaton/api";

const { app } = createRelatonApi({ name: "api.relaton.org" });

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
