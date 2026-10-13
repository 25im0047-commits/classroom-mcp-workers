// No tokens, Google credentials, registration, or Classroom data are needed.
const base = process.argv[2];
const unconfigured = process.argv.includes("--expect-unconfigured");
if (!base || new URL(base).origin !== base || !base.startsWith("https://")) {
  throw new Error("Use an HTTPS origin without a trailing slash.");
}
async function request(path, init) {
  return fetch(`${base}${path}`, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
}
function verify(condition, name) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
const health = await request("/health");
verify(health.status === (unconfigured ? 503 : 200), "health status");
const healthData = await health.json();
verify(
  healthData.status === (unconfigured ? "configuration_required" : "ok"),
  "health configuration state",
);
verify(
  health.headers.get("Cache-Control") === "no-store",
  "health is not cached",
);
const discovery = await request("/.well-known/oauth-authorization-server");
verify(discovery.status === 200, "OAuth discovery");
const auth = await discovery.json();
verify(auth.issuer === base, "canonical OAuth issuer");
verify(
  auth.authorization_endpoint === `${base}/authorize`,
  "authorization endpoint",
);
verify(auth.token_endpoint === `${base}/oauth/token`, "token endpoint");
verify(auth.code_challenge_methods_supported.includes("S256"), "S256 PKCE");
verify(auth.scopes_supported.includes("classroom:read"), "read scope");
verify(
  !auth.scopes_supported.includes("unipa:read"),
  "optional UNIPA disabled",
);
const resource = await request("/.well-known/oauth-protected-resource/mcp");
verify(resource.status === 200, "protected-resource discovery");
const metadata = await resource.json();
verify(metadata.resource === `${base}/mcp`, "MCP resource audience");
verify(metadata.authorization_servers.includes(base), "authorization server");
for (const method of ["GET", "POST"]) {
  const mcp = await request("/mcp", { method });
  verify(mcp.status === 401, `${method} /mcp rejects anonymous access`);
  verify(
    mcp.headers.get("WWW-Authenticate")?.includes("resource_metadata"),
    "OAuth challenge",
  );
}
const authorize = await request("/authorize");
verify(
  authorize.status === (unconfigured ? 503 : 400),
  "authorization requires configuration and valid transaction",
);
const callback = await request("/callback?code=smoke-invalid-code");
verify(
  callback.status === (unconfigured ? 503 : 400),
  "callback rejects missing state",
);
console.log("No Google login or Classroom API call was performed.");
