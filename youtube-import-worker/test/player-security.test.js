const test = require("node:test");
const assert = require("node:assert/strict");
const security = require("../player-security.js");

test("accepts HTTPS URL or iframe src and normalizes it", () => {
  const direct = security.extractURL("https://media.example.test/embed/abc");
  const iframe = security.extractURL('<iframe src="https://player.example.test/embed/abc?a=1&amp;b=2"></iframe>');
  assert.equal(direct.href, "https://media.example.test/embed/abc");
  assert.equal(iframe.href, "https://player.example.test/embed/abc?a=1&b=2");
});

test("rejects insecure, credentialed, and local URLs", () => {
  for (const url of [
    "http://media.example.test/video",
    "javascript:alert(1)",
    "https://user:pass@media.example.test/video",
    "https://localhost/video",
    "https://127.0.0.1/video",
    "https://192.168.1.2/video",
  ]) assert.equal(security.extractURL(url), null, url);
});

test("maps supported provider links to their embed endpoints", () => {
  assert.match(security.frameURL({ type: "youtube" }, "https://www.youtube.com/watch?v=abc123"), /youtube-nocookie\.com\/embed\/abc123/);
  assert.equal(security.frameURL({ type: "vk" }, "https://vk.com/video-4_55"), "https://vk.com/video_ext.php?oid=-4&id=55");
  assert.equal(security.frameURL({ type: "ok" }, "https://ok.ru/video/123"), "https://ok.ru/videoembed/123");
});

test("sandbox permission normalization never grants popup or top navigation escape", () => {
  const server = { url: "https://player.example.test/embed/abc", security: { sandbox: ["scripts", "sameOrigin", "allow-popups", "allow-top-navigation", "forms"] } };
  const tokens = security.sandboxTokens(server.security);
  assert.deepEqual(tokens, ["allow-scripts", "allow-same-origin", "allow-forms"]);
  assert.equal(tokens.some((token) => /popup|top-navigation/i.test(token)), false);
});

test("suspended and rejected servers do not enter the approved frame-origin list", () => {
  const viewing = {
    servers: [
      { url: "https://clean.example.test/embed/1", security: { status: "active", classification: "clean" } },
      { url: "https://paused.example.test/embed/2", security: { status: "suspended", classification: "clean" } },
      { url: "https://rejected.example.test/embed/3", security: { status: "active", classification: "rejected" } },
    ],
  };
  assert.deepEqual(security.collectApprovedOrigins(viewing), ["https://clean.example.test"]);
});

test("sanitization clears malformed provider URLs and marks them rejected", () => {
  const safe = security.sanitizeServer({ name: "bad", url: "<script>alert(1)</script>" });
  assert.equal(safe.url, "");
  assert.equal(safe.security.status, "suspended");
  assert.equal(safe.security.classification, "rejected");
});


test("domain allowlist accepts exact domains and their subdomains only", () => {
  assert.equal(security.isDomainApproved("player.example.test", ["example.test"]), true);
  assert.equal(security.isDomainApproved("example.test", ["example.test"]), true);
  assert.equal(security.isDomainApproved("notexample.test", ["example.test"]), false);
  assert.equal(security.isDomainApproved("player.example.test.evil.test", ["example.test"]), false);
});

test("server build sanitization rejects domains not explicitly approved", () => {
  const unapproved = security.sanitizeServer({ url: "https://video.example.test/embed/1" }, ["youtube.com"]);
  assert.equal(unapproved.url, "");
  assert.equal(unapproved.security.status, "suspended");
  assert.equal(unapproved.security.classification, "rejected");
  assert.equal(unapproved.security.reason, "provider_domain_not_allowlisted");
  const approved = security.sanitizeServer({ url: "https://player.example.test/embed/1" }, ["example.test"]);
  assert.equal(approved.url, "https://player.example.test/embed/1");
  assert.equal(approved.security.status, "active");
});


test("same-origin provider iframes are rejected to prevent sandbox escape", () => {
  const sameOrigin = security.sanitizeServer(
    { url: "https://site.example.test/embed/1", type: "iframe" },
    ["example.test"],
    "https://site.example.test",
  );
  assert.equal(sameOrigin.url, "");
  assert.equal(sameOrigin.security.reason, "same_origin_provider_not_allowed");
});
