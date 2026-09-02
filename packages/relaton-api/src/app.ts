import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { parseConfig, type RelatonApiConfig } from "./config";
import type { AppEnv } from "./env";
import { adminRoutes } from "./routes/admin";
import { restRoutes } from "./routes/rest";
import { graphqlRoute } from "./routes/graphql";
import { renderHome } from "./routes/home";

export function createApp(configInput: unknown = {}) {
  const config: RelatonApiConfig = parseConfig(configInput);
  const app = new OpenAPIHono<AppEnv>();

  app.doc31(config.paths.openapi, (c) => ({
    openapi: "3.1.0",
    info: {
      title: config.name,
      version: c.env.API_VERSION ?? "dev",
      description:
        "Bibliographic data for technical standards, aggregated across relaton-data-* repositories.",
    },
    servers: [{ url: "https://api.relaton.org" }],
  }));

  app.get(config.paths.docs, (c) => c.html(`<!doctype html>
<html>
  <head>
    <title>${config.name}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <scalar-api-reference url="${config.paths.openapi}"></scalar-api-reference>
  </body>
</html>`));

  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }));

  app.get("/", async (c) => c.html(await renderHome(c.env.DB, c.env.API_VERSION ?? "dev", config.name)));

  app.route("/", restRoutes);
  app.route("/", adminRoutes);
  app.all(config.paths.graphql, graphqlRoute());

  app.notFound((c) => c.text("Resource doesn't exist.", 404));

  // Surface the actual error so debugging doesn't require tail.
  app.onError((err, c) => {
    console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, err);
    return c.text(`Internal server error: ${err.message}`, 500);
  });

  return app;
}
