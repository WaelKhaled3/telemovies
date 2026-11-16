(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TMPlayerSecurity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SANDBOX_TOKENS = Object.freeze({
    scripts: "allow-scripts",
    sameOrigin: "allow-same-origin",
    forms: "allow-forms",
    presentation: "allow-presentation",
  });
  const DEFAULT_APPROVED_DOMAINS = Object.freeze([
    "youtube.com",
    "youtube-nocookie.com",
    "youtu.be",
    "vk.com",
    "ok.ru",
  ]);
  const CLASSIFICATIONS = new Set(["clean", "limited_ads", "rejected"]);
  const STATUSES = new Set(["active", "suspended"]);
  const DEFAULT_PERMISSIONS = Object.freeze(["scripts", "sameOrigin"]);

  function extractURL(value) {
    let raw = String(value || "").trim();
    const iframe = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (iframe) raw = iframe[2].replace(/&amp;/g, "&");
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return null;
      const hostname = url.hostname.toLowerCase();
      if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return null;
      if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname) || hostname === "::1" || hostname === "[::1]" || /^(?:fc|fd|fe80:)/i.test(hostname)) return null;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return null;
      return url;
    } catch {
      return null;
    }
  }

  function normalizeDomains(values) {
    const input = Array.isArray(values) ? values : String(values || "").split(/[\n,;]+/);
    const domains = new Set();
    for (const value of input) {
      const candidate = String(value || "").trim().toLowerCase().replace(/\.$/, "");
      if (!candidate || candidate.includes("*") || candidate.includes("/") || candidate.includes(":") || candidate.includes("@")) continue;
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)) continue;
      domains.add(candidate);
    }
    return [...domains].sort();
  }

  function isDomainApproved(hostname, allowedDomains) {
    const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
    const domains = normalizeDomains(Array.isArray(allowedDomains) ? allowedDomains : DEFAULT_APPROVED_DOMAINS);
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  function normalizeSecurity(server) {
    const raw = server && server.security && typeof server.security === "object" ? server.security : {};
    const requested = Array.isArray(raw.sandbox) ? raw.sandbox : DEFAULT_PERMISSIONS;
    const sandbox = [...new Set(requested.filter((key) => Object.prototype.hasOwnProperty.call(SANDBOX_TOKENS, key)))];
    return {
      status: STATUSES.has(raw.status) ? raw.status : "active",
      classification: CLASSIFICATIONS.has(raw.classification) ? raw.classification : "limited_ads",
      sandbox,
      fullscreen: raw.fullscreen !== false,
    };
  }

  function inferType(server, url) {
    let type = String(server && server.type || "auto").toLowerCase();
    if (type !== "auto") return type;
    const href = url.href;
    if (/\.m3u8(?:$|[?#])/i.test(href)) return "hls";
    if (/\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i.test(href)) return "mp4";
    if (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com") || url.hostname === "youtube-nocookie.com" || url.hostname.endsWith(".youtube-nocookie.com") || url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) return "youtube";
    if (url.hostname === "vk.com" || url.hostname.endsWith(".vk.com")) return "vk";
    if (url.hostname === "ok.ru" || url.hostname.endsWith(".ok.ru")) return "ok";
    return "iframe";
  }

  function frameURL(server, sourceURL) {
    const url = sourceURL instanceof URL ? sourceURL : extractURL(sourceURL || (server && server.url));
    if (!url) return "";
    const type = inferType(server || {}, url);
    if (type === "mp4" || type === "hls") return "";
    if (type === "youtube") {
      const id = url.hostname === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1` : "";
    }
    if (type === "vk") {
      if (/video_ext\.php$/i.test(url.pathname)) return url.href;
      const match = url.href.match(/video(-?\d+)_([0-9]+)/);
      if (match) return `https://vk.com/video_ext.php?oid=${encodeURIComponent(match[1])}&id=${encodeURIComponent(match[2])}`;
      const owner = url.searchParams.get("oid");
      const video = url.searchParams.get("id");
      return owner && video ? `https://vk.com/video_ext.php?oid=${encodeURIComponent(owner)}&id=${encodeURIComponent(video)}` : url.href;
    }
    if (type === "ok") {
      if (/\/videoembed\//i.test(url.pathname)) return url.href;
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      return id ? `https://ok.ru/videoembed/${encodeURIComponent(id)}` : url.href;
    }
    return url.href;
  }

  function validateServer(server, allowedDomains, parentOrigin) {
    const url = extractURL(server && server.url);
    const security = normalizeSecurity(server);
    if (!url) return { valid: false, approved: false, active: false, url: "", frameUrl: "", origin: "", type: "iframe", security };
    const approved = isDomainApproved(url.hostname, allowedDomains);
    const type = inferType(server || {}, url);
    const playableByState = (!server || server.enabled !== false) && security.status === "active" && security.classification !== "rejected";
    const frame = frameURL(server || {}, url);
    const sameOriginFrame = !!frame && !!parentOrigin && new URL(frame).origin === parentOrigin;
    return {
      valid: true,
      approved,
      sameOriginFrame,
      active: playableByState && (allowedDomains === undefined || approved) && !sameOriginFrame,
      url: url.href,
      frameUrl: frame,
      origin: frame ? new URL(frame).origin : url.origin,
      type,
      security,
    };
  }

  function sandboxTokens(security) {
    const normalized = normalizeSecurity({ security });
    return normalized.sandbox.map((key) => SANDBOX_TOKENS[key]).filter(Boolean);
  }

  function sanitizeServer(server, allowedDomains, parentOrigin) {
    const input = server && typeof server === "object" ? server : {};
    const policy = validateServer(input, allowedDomains, parentOrigin);
    if (!policy.valid || !policy.approved || policy.sameOriginFrame) {
      return {
        ...input,
        url: "",
        security: {
          ...policy.security,
          status: "suspended",
          classification: "rejected",
          reason: !policy.valid ? "invalid_https_url" : policy.sameOriginFrame ? "same_origin_provider_not_allowed" : "provider_domain_not_allowlisted",
        },
      };
    }
    return { ...input, url: policy.url, security: policy.security };
  }

  function collectApprovedOrigins(viewing) {
    const origins = new Set();
    const visit = (servers) => {
      for (const server of Array.isArray(servers) ? servers : []) {
        const policy = validateServer(server);
        if (policy.valid && policy.active && policy.frameUrl) origins.add(policy.origin);
      }
    };
    visit(viewing && viewing.servers);
    for (const part of Array.isArray(viewing && viewing.parts) ? viewing.parts : []) visit(part && part.servers);
    for (const season of Array.isArray(viewing && viewing.seasons) ? viewing.seasons : []) {
      for (const episode of Array.isArray(season && season.episodes) ? season.episodes : []) visit(episode && episode.servers);
    }
    return [...origins].sort();
  }

  return Object.freeze({
    SANDBOX_TOKENS,
    DEFAULT_APPROVED_DOMAINS,
    extractURL,
    normalizeDomains,
    isDomainApproved,
    normalizeSecurity,
    inferType,
    frameURL,
    validateServer,
    sandboxTokens,
    sanitizeServer,
    collectApprovedOrigins,
  });
});
