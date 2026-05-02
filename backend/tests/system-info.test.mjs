import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";

async function startServer() {
  process.env.VERCEL = "1";
  const { default: app } = await import("../src/server.js");

  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    })
  };
}

test("GET /api/system-info returns required runtime fields", async () => {
  const runtime = await startServer();

  try {
    const response = await fetch(`${runtime.baseUrl}/api/system-info`);
    assert.equal(response.status, 200);

    const payload = await response.json();

    assert.equal(typeof payload.os, "string");
    assert.equal(typeof payload.arch, "string");
    assert.equal(typeof payload.cpuCount, "number");
    assert.equal(typeof payload.cpuModel, "string");
    assert.equal(typeof payload.totalMemory, "string");
    assert.equal(typeof payload.freeMemory, "string");
    assert.equal(typeof payload.usedMemory, "string");
    assert.equal(typeof payload.uptime, "number");
    assert.equal(typeof payload.hostname, "string");
    assert.equal(typeof payload.nodeVersion, "string");
  } finally {
    await runtime.close();
  }
});

test("GET /api/watch returns watcher status object", async () => {
  const runtime = await startServer();

  try {
    const response = await fetch(`${runtime.baseUrl}/api/watch`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(typeof payload.active, "boolean");
  } finally {
    await runtime.close();
  }
});
