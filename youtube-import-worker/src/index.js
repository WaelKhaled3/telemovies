const DEFAULT_ALLOWED_ORIGIN = "https://telemovies.wk7.workers.dev";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/playlistItems";

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(body, status, origin, allowedOrigin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin, allowedOrigin),
  });
}

export function parsePlaylistId(input) {
  const value = String(input || "").trim();
  if (/^[A-Za-z0-9_-]{10,128}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isYouTube = host === "youtube.com" || host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com") ||
      host === "youtu.be" || host.endsWith(".youtu.be");
    if (!isYouTube) return "";
    const id = url.searchParams.get("list") || "";
    return /^[A-Za-z0-9_-]{10,128}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

function chooseThumbnail(thumbnails) {
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const url = thumbnails?.[key]?.url;
    if (typeof url === "string" && /^https:\/\//i.test(url)) return url;
  }
  return "";
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function mapYouTubeError(payload, status) {
  const reasons = (payload?.error?.errors || []).map((item) => String(item.reason || ""));
  const reason = reasons.join(" ").toLowerCase();
  if (/quotaexceeded|dailylimitexceeded|userratelimitexceeded/.test(reason)) {
    return { status: 429, code: "quota_exceeded", message: "تجاوزت حصة YouTube API أو حد الطلبات. تحقق من الحصة ومفتاح API." };
  }
  if (status === 404) {
    return { status: 404, code: "playlist_not_found", message: "لم يتم العثور على قائمة التشغيل أو أنها غير متاحة للعامة." };
  }
  if (status === 400) {
    return { status: 400, code: "invalid_playlist", message: "رابط قائمة التشغيل غير صالح أو تعذّر على YouTube قراءته." };
  }
  if (status === 403) {
    return { status: 403, code: "api_forbidden", message: "رفض YouTube API الطلب. تحقق من تفعيل YouTube Data API v3 وقيود المفتاح." };
  }
  return { status: 502, code: "youtube_api_error", message: "تعذّر جلب القائمة من YouTube حالياً." };
}

export async function handleYouTubeRequest(request, env = {}, fetcher = globalThis.fetch) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  if (origin && origin !== allowedOrigin) {
    return json({ ok: false, code: "origin_not_allowed", message: "هذا المصدر غير مسموح له باستخدام خدمة الاستيراد." }, 403, "", allowedOrigin);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigin) });
  }
  if (requestUrl.pathname === "/health" && request.method === "GET") {
    return json({ ok: true }, 200, origin, allowedOrigin);
  }
  if (requestUrl.pathname !== "/api/youtube-playlist") {
    return json({ ok: false, code: "not_found", message: "المسار غير موجود." }, 404, origin, allowedOrigin);
  }
  if (request.method !== "POST") {
    return json({ ok: false, code: "method_not_allowed", message: "استخدم POST." }, 405, origin, allowedOrigin);
  }
  if (origin && origin !== allowedOrigin) {
    return json({ ok: false, code: "origin_not_allowed", message: "هذا المصدر غير مسموح له باستخدام خدمة الاستيراد." }, 403, origin, allowedOrigin);
  }
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ ok: false, code: "json_required", message: "أرسل البيانات بصيغة JSON." }, 415, origin, allowedOrigin);
  }
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 4096) {
    return json({ ok: false, code: "request_too_large", message: "الطلب أكبر من الحجم المسموح." }, 413, origin, allowedOrigin);
  }
  if (env.YOUTUBE_IMPORT_LIMITER?.limit) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.YOUTUBE_IMPORT_LIMITER.limit({ key: `youtube-import:${ip}` });
    if (!success) {
      return json({ ok: false, code: "rate_limited", message: "وصلت إلى حد الاستيراد المؤقت. انتظر دقيقة ثم أعد المحاولة." }, 429, origin, allowedOrigin);
    }
  }
  if (!env.YOUTUBE_IMPORT_TOKEN) {
    return json({ ok: false, code: "import_token_missing", message: "لم يُضبط رمز حماية الاستيراد في Cloudflare Secret بعد." }, 503, origin, allowedOrigin);
  }
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!constantTimeEqual(bearer, env.YOUTUBE_IMPORT_TOKEN)) {
    return json({ ok: false, code: "unauthorized", message: "رمز الاستيراد غير صحيح. أدخله في لوحة الإدارة." }, 401, origin, allowedOrigin);
  }
  if (!env.YOUTUBE_API_KEY) {
    return json({ ok: false, code: "secret_missing", message: "لم يُضبط مفتاح YouTube في Cloudflare Secret بعد." }, 503, origin, allowedOrigin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: "invalid_json", message: "تعذّر قراءة بيانات الطلب." }, 400, origin, allowedOrigin);
  }
  const playlistId = parsePlaylistId(body?.playlistUrl);
  if (!playlistId) {
    return json({ ok: false, code: "invalid_playlist_url", message: "أدخل رابط Playlist عامّاً من YouTube أو معرّف قائمة صالحاً." }, 400, origin, allowedOrigin);
  }
  const pageToken = String(body?.pageToken || "").trim();
  if (pageToken.length > 2048 || /[\u0000-\u001f]/.test(pageToken)) {
    return json({ ok: false, code: "invalid_page_token", message: "رمز صفحة YouTube غير صالح." }, 400, origin, allowedOrigin);
  }

  const apiUrl = new URL(YOUTUBE_API);
  apiUrl.searchParams.set("part", "snippet,contentDetails,status");
  apiUrl.searchParams.set("playlistId", playlistId);
  apiUrl.searchParams.set("maxResults", "50");
  apiUrl.searchParams.set("fields", "nextPageToken,pageInfo(totalResults,resultsPerPage),items(snippet(title,position,thumbnails,resourceId/videoId),contentDetails/videoId,status/privacyStatus)");
  apiUrl.searchParams.set("key", env.YOUTUBE_API_KEY);
  if (pageToken) apiUrl.searchParams.set("pageToken", pageToken);

  let upstream;
  try {
    upstream = await fetcher(apiUrl.toString(), { method: "GET", headers: { Accept: "application/json" } });
  } catch {
    return json({ ok: false, code: "upstream_unreachable", message: "تعذّر الاتصال بخدمة YouTube. أعد المحاولة لاحقاً." }, 502, origin, allowedOrigin);
  }
  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json({ ok: false, code: "upstream_invalid_response", message: "أعاد YouTube استجابة غير مفهومة." }, 502, origin, allowedOrigin);
  }
  if (!upstream.ok) {
    const error = mapYouTubeError(payload, upstream.status);
    return json({ ok: false, ...error }, error.status, origin, allowedOrigin);
  }

  const items = [];
  const failures = [];
  for (const [index, raw] of (Array.isArray(payload.items) ? payload.items : []).entries()) {
    const snippet = raw?.snippet || {};
    const videoId = String(raw?.contentDetails?.videoId || snippet?.resourceId?.videoId || "").trim();
    const title = String(snippet.title || "").trim();
    const positionValue = Number(snippet.position);
    const position = Number.isInteger(positionValue) && positionValue >= 0 ? positionValue : index;
    const privacy = String(raw?.status?.privacyStatus || "").toLowerCase();
    const unavailableTitle = /^(private video|deleted video|فيديو خاص|فيديو محذوف)$/i.test(title);
    if (!videoId || !title || privacy === "private" || unavailableTitle) {
      failures.push({ position, title: title || "عنصر بلا عنوان", reason: privacy === "private" || unavailableTitle ? "الفيديو خاص أو محذوف ولا يمكن تضمينه." : "لم يوفّر YouTube معرّف فيديو صالحاً لهذا العنصر." });
      continue;
    }
    const thumbnail = chooseThumbnail(snippet.thumbnails) || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
    items.push({
      videoId,
      title,
      position,
      thumbnail,
      embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
    });
  }
  items.sort((a, b) => a.position - b.position);
  return json({
    ok: true,
    playlistId,
    items,
    failures,
    totalResults: Number(payload.pageInfo?.totalResults || 0),
    resultsPerPage: Number(payload.pageInfo?.resultsPerPage || items.length),
    nextPageToken: typeof payload.nextPageToken === "string" ? payload.nextPageToken : "",
  }, 200, origin, allowedOrigin);
}

export default {
  fetch(request, env) {
    return handleYouTubeRequest(request, env);
  },
};
