import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BODY = 2 * 1024 * 1024;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// The token stays on the server and is scoped to the fixed backend origin.
export function metadataTokenProvider(audience, fetcher = fetch) {
  let cached;
  let pending;
  return async () => {
    if (cached && cached.expires > Date.now() + 60000) return cached.token;
    if (!pending)
      pending = (async () => {
        const url = new URL(
          "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
        );
        url.searchParams.set("audience", audience);
        url.searchParams.set("format", "full");
        const response = await fetcher(url, {
          headers: { "Metadata-Flavor": "Google" },
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error("Identity unavailable");
        const token = await response.text();
        const claims = JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString(),
        );
        if (
          typeof claims.exp !== "number" ||
          claims.exp * 1000 <= Date.now() ||
          claims.aud !== audience
        )
          throw new Error("Invalid identity response");
        cached = { token, expires: claims.exp * 1000 };
        return token;
      })().finally(() => {
        pending = null;
      });
    return pending;
  };
}

function bodyOf(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let length = 0;
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_BODY) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

export function createGateway({
  backendUrl,
  root = fileURLToPath(new URL("./dist", import.meta.url)),
  getToken,
  fetcher = fetch,
}) {
  const backend = new URL(backendUrl);
  if (
    !["http:", "https:"].includes(backend.protocol) ||
    backend.username ||
    backend.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash
  )
    throw new Error(
      "BACKEND_URL must be an HTTP(S) origin without credentials or a path",
    );
  const directory = resolve(root);
  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/health") {
        response.writeHead(200);
        response.end("ok");
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
          response.writeHead(405);
          response.end();
          return;
        }
        const body = ["POST", "PUT"].includes(request.method)
          ? await bodyOf(request)
          : undefined;
        const headers = { Accept: "application/json" };
        if (body)
          headers["Content-Type"] =
            request.headers["content-type"] || "application/json";
        if (getToken) headers.Authorization = `Bearer ${await getToken()}`;
        const upstream = await fetcher(
          new URL(url.pathname + url.search, backend),
          {
            method: request.method,
            headers,
            body,
            redirect: "manual",
            signal: AbortSignal.timeout(30000),
          },
        );
        response.statusCode = upstream.status;
        for (const name of ["content-type", "location"]) {
          const value = upstream.headers.get(name);
          if (value) response.setHeader(name, value);
        }
        response.setHeader("Cache-Control", "no-store");
        response.end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405);
        response.end();
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes("\0") || pathname.includes("\\")) {
        response.writeHead(400);
        response.end();
        return;
      }
      let file = resolve(directory, "." + pathname);
      if (file !== directory && !file.startsWith(directory + "/")) {
        response.writeHead(404);
        response.end();
        return;
      }
      if (pathname === "/") file = resolve(directory, "index.html");
      let data;
      try {
        data = await readFile(file);
      } catch (error) {
        if (!["ENOENT", "EISDIR"].includes(error.code)) throw error;
        if (extname(pathname)) {
          response.writeHead(404);
          response.end();
          return;
        }
        file = resolve(directory, "index.html");
        data = await readFile(file);
      }
      response.setHeader(
        "Content-Type",
        mime[extname(file)] || "application/octet-stream",
      );
      response.setHeader(
        "Cache-Control",
        file.endsWith("index.html") ? "no-store" : "public, max-age=3600",
      );
      response.end(request.method === "HEAD" ? undefined : data);
    } catch (error) {
      response.statusCode = error.status === 413 ? 413 : 502;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/problem+json");
      // Do not expose upstream errors, metadata responses, or credentials.
      response.end(
        JSON.stringify({
          status: response.statusCode,
          detail:
            response.statusCode === 413
              ? "Request too large"
              : "Backend unavailable. Your edits remain in the editor; try again.",
        }),
      );
    }
  });
}

export function start(env = process.env) {
  const backend = new URL(env.BACKEND_URL);
  const mode = env.BACKEND_AUTH_MODE || "metadata";
  if (
    !["metadata", "none"].includes(mode) ||
    (mode === "metadata" && backend.protocol !== "https:")
  )
    throw new Error(
      "Use HTTPS and metadata authentication on Cloud Run. Mode none is for local testing only.",
    );
  const server = createGateway({
    backendUrl: backend.href,
    getToken:
      mode === "metadata" ? metadataTokenProvider(backend.origin) : undefined,
  });
  server.listen(Number(env.PORT || 8080), "0.0.0.0");
  process.on("SIGTERM", () => server.close());
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  start();
