import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const CONFIG_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  pragma: "no-cache",
  expires: "0",
};

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function serveRuntimeConfig(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/config.json") return null;

  try {
    const { readFile } = await import("node:fs/promises");
    const configuredPath = process.env.RUNTIME_CONFIG_PATH;
    const candidatePaths = [
      ...(configuredPath ? [configuredPath] : []),
      "/app/config.json",
      "/app/.output/public/config.json",
      "./config.json",
      "./public/config.json"
    ];
    const uniquePaths = Array.from(new Set(candidatePaths));

    console.log(`[serveRuntimeConfig] Checking candidate paths:`, uniquePaths);

    for (const filePath of uniquePaths) {
      try {
        console.log(`[serveRuntimeConfig] Attempting to read: ${filePath}`);
        const body = await readFile(filePath, "utf8");
        JSON.parse(body);
        console.log(`[serveRuntimeConfig] SUCCESS: Loaded and parsed config at ${filePath}`);
        return new Response(body, { headers: CONFIG_HEADERS });
      } catch (error) {
        const err = error as { code?: string; message?: string };
        console.warn(`[serveRuntimeConfig] FAILED to load ${filePath}: code=${err.code}, message=${err.message || err}`);
        if (err.code === "ENOENT") {
          continue;
        }
        console.error(`[serveRuntimeConfig] CRITICAL: Invalid JSON or permission error at ${filePath}:`, err.message || err);
        return new Response(JSON.stringify({ error: `Invalid runtime config at ${filePath}: ${err.message || err}` }), {
          status: 500,
          headers: CONFIG_HEADERS,
        });
      }
    }
  } catch (err) {
    console.error("[serveRuntimeConfig] General filesystem access error:", err);
  }

  // Fallback: If no config file was loaded, check if any tenant environment variables are set.
  const envConfig: Record<string, unknown> = {};
  const keys = [
    "TENANT_ID",
    "TENANT_NAME",
    "TENANT_TOPIC",
    "SYSTEM_PROMPT",
    "TAVILY_API_KEY",
    "OLLAMA_URL",
    "OLLAMA_MODEL",
    "MAX_TAVILY_RESULTS",
    "TEST_MODE"
  ] as const;

  let hasEnvVar = false;
  for (const key of keys) {
    const val = process.env[key] ?? process.env[`NITRO_${key}`];
    if (val !== undefined && val !== "") {
      hasEnvVar = true;
      if (key === "MAX_TAVILY_RESULTS") {
        const num = Number(val);
        envConfig[key] = Number.isFinite(num) ? num : val;
      } else {
        envConfig[key] = val;
      }
    }
  }

  if (hasEnvVar) {
    return new Response(JSON.stringify(envConfig), { headers: CONFIG_HEADERS });
  }

  return null;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const runtimeConfig = await serveRuntimeConfig(request);
      if (runtimeConfig) return runtimeConfig;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
