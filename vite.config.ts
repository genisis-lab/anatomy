import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
const PRODUCTION_DATABASE_ID = "05fb2631-7705-4104-8595-56ec3a687aa0";

const { d1, r2 } = hostingConfig;
const isCloudflareDeploy = process.env.CLOUDFLARE_DEPLOY === "1";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  name: "anatomy-atelier",
  main: "./worker/index.ts",
  compatibility_date: "2026-08-08",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: isCloudflareDeploy ? "anatomy-atelier" : "site-creator-d1",
          database_id: isCloudflareDeploy ? PRODUCTION_DATABASE_ID : SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          migrations_dir: "drizzle",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
  ...(isCloudflareDeploy
    ? {
        assets: { binding: "ASSETS", run_worker_first: true },
        images: { binding: "IMAGES" },
        observability: { enabled: true },
      }
    : {}),
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
        inspectorPort: isCodexSeatbeltSandbox ? false : undefined,
      }),
    ],
  };
});
