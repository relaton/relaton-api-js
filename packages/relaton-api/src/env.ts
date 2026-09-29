// ADMIN_TOKEN is a secret, invisible to `wrangler types` regeneration.
export type Env = Cloudflare.Env & { ADMIN_TOKEN: string };
export type AppEnv = { Bindings: Env };
