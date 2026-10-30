import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGateway, metadataTokenProvider, start } from "./server.mjs";

async function listen(t, server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}
async function root(t) {
  const dir = await mkdtemp(join(tmpdir(), "notesapp-gateway-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "index.html"), "<h1>NotesApp</h1>");
  await writeFile(join(dir, "app.js"), 'console.log("notes")');
  return dir;
}

test("serves the SPA, assets, health, HEAD, and missing assets", async (t) => {
  const url = await listen(
    t,
    createGateway({ backendUrl: "http://127.0.0.1:1", root: await root(t) }),
  );
  assert.equal(await (await fetch(url + "/")).text(), "<h1>NotesApp</h1>");
  assert.equal(
    await (await fetch(url + "/editor")).text(),
    "<h1>NotesApp</h1>",
  );
  assert.match(
    (await fetch(url + "/app.js")).headers.get("content-type"),
    /javascript/,
  );
  assert.equal((await fetch(url + "/missing.js")).status, 404);
  assert.equal((await fetch(url + "/health")).status, 200);
  assert.equal(await (await fetch(url + "/", { method: "HEAD" })).text(), "");
  assert.equal((await fetch(url + "/..%2f..%2fsecret.js")).status, 404);
});

test("proxies path, search, body, status and replaces inbound credentials", async (t) => {
  let received;
  const backend = await listen(
    t,
    http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received = {
        path: req.url,
        auth: req.headers.authorization,
        cookie: req.headers.cookie,
        body: Buffer.concat(chunks).toString(),
      };
      res.writeHead(201, {
        "Content-Type": "application/json",
        Location: "/api/v1/notes/id",
      });
      res.end('{"id":"id"}');
    }),
  );
  const url = await listen(
    t,
    createGateway({
      backendUrl: backend,
      root: await root(t),
      getToken: async () => "backend-identity",
    }),
  );
  const response = await fetch(url + "/api/v1/notes?q=hello%20world", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer user-identity",
      Cookie: "private=user",
    },
    body: '{"title":"Idea"}',
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("location"), "/api/v1/notes/id");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { id: "id" });
  assert.deepEqual(received, {
    path: "/api/v1/notes?q=hello%20world",
    auth: "Bearer backend-identity",
    cookie: undefined,
    body: '{"title":"Idea"}',
  });
});

test("preserves backend validation and deletion responses", async (t) => {
  const backend = await listen(
    t,
    http.createServer((req, res) => {
      if (req.method === "DELETE") {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(409, { "Content-Type": "application/problem+json" });
        res.end('{"detail":"Changed elsewhere"}');
      }
    }),
  );
  const url = await listen(
    t,
    createGateway({ backendUrl: backend, root: await root(t) }),
  );
  assert.equal((await fetch(url + "/api/v1/notes/id")).status, 409);
  assert.equal(
    (await fetch(url + "/api/v1/notes/id", { method: "DELETE" })).status,
    204,
  );
});

test("fails closed when identity is unavailable without exposing tokens or errors", async (t) => {
  let calls = 0;
  const url = await listen(
    t,
    createGateway({
      backendUrl: "https://example.run.app",
      root: await root(t),
      getToken: async () => {
        throw new Error("sensitive identity details");
      },
      fetcher: async () => {
        calls++;
      },
    }),
  );
  const response = await fetch(url + "/api/v1/notes");
  assert.equal(response.status, 502);
  assert.equal(calls, 0);
  assert.doesNotMatch(await response.text(), /sensitive/);
});

test("rejects oversized bodies and unsupported methods before reaching backend", async (t) => {
  let calls = 0;
  const url = await listen(
    t,
    createGateway({
      backendUrl: "http://127.0.0.1:1",
      root: await root(t),
      fetcher: async () => {
        calls++;
      },
    }),
  );
  assert.equal(
    (
      await fetch(url + "/api/v1/notes", {
        method: "POST",
        body: "x".repeat(2 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
  assert.equal(
    (await fetch(url + "/api/v1/notes", { method: "PATCH" })).status,
    405,
  );
  assert.equal(calls, 0);
});

test("metadata tokens are audience-bound, cached, and concurrent refreshes coalesce", async () => {
  const audience = "https://api.example.run.app";
  let calls = 0;
  const token =
    "header." +
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".signature";
  const provider = metadataTokenProvider(audience, async (url, options) => {
    calls++;
    assert.equal(url.hostname, "metadata.google.internal");
    assert.equal(url.searchParams.get("audience"), audience);
    assert.equal(options.headers["Metadata-Flavor"], "Google");
    return new Response(token);
  });
  assert.deepEqual(await Promise.all([provider(), provider()]), [token, token]);
  assert.equal(await provider(), token);
  assert.equal(calls, 1);
});

test("failed metadata retrieval can be retried and mismatched tokens are rejected", async () => {
  let attempts = 0;
  const provider = metadataTokenProvider(
    "https://api.example.run.app",
    async () => {
      attempts++;
      return new Response("not a token", {
        status: attempts === 1 ? 503 : 200,
      });
    },
  );
  await assert.rejects(provider());
  await assert.rejects(provider());
  assert.equal(attempts, 2);
  assert.throws(
    () => start({ BACKEND_URL: "http://example.run.app" }),
    /HTTPS/,
  );
  assert.throws(
    () => createGateway({ backendUrl: "https://example.run.app/unsafe" }),
    /origin/,
  );
});
