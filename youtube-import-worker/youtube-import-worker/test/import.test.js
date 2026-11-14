import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { handleYouTubeRequest, parsePlaylistId } from "../src/index.js";

const SITE_ORIGIN = "https://telemovies.wk7.workers.dev";
const API_KEY = "test-secret-not-for-production";

function post(body, origin = SITE_ORIGIN, token = "test-import-token") {
  return new Request("https://telemovies-youtube-import.wk7.workers.dev/api/youtube-playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function youtubeItem(id, position, title = `Episode ${position + 1}`) {
  return {
    snippet: {
      title,
      position,
      resourceId: { videoId: id },
      thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } },
    },
    contentDetails: { videoId: id },
    status: { privacyStatus: "public" },
  };
}

test("accepts YouTube playlist URLs and rejects unrelated hosts", () => {
  assert.equal(parsePlaylistId("https://www.youtube.com/playlist?list=PLabcdefghijk"), "PLabcdefghijk");
  assert.equal(parsePlaylistId("https://youtu.be/abc12345678?list=PLabcdefghijk"), "PLabcdefghijk");
  assert.equal(parsePlaylistId("https://example.com/playlist?list=PLabcdefghijk"), "");
  assert.equal(parsePlaylistId("https://www.youtube.com/watch?v=abc12345678"), "");
});

test("uses the secret server-side and returns title, ID, thumbnail and embed URL", async () => {
  let upstreamUrl;
  const request = post({ playlistUrl: "https://www.youtube.com/playlist?list=PLabcdefghijk" });
  const response = await handleYouTubeRequest(request, { YOUTUBE_API_KEY: API_KEY, YOUTUBE_IMPORT_TOKEN: "test-import-token" }, async (url) => {
    upstreamUrl = new URL(url);
    return Response.json({
      pageInfo: { totalResults: 1, resultsPerPage: 1 },
      items: [youtubeItem("abcdefghijk", 0, "First episode")],
    });
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl.searchParams.get("key"), API_KEY);
  assert.equal(upstreamUrl.searchParams.get("maxResults"), "50");
  assert.equal(upstreamUrl.searchParams.get("playlistId"), "PLabcdefghijk");
  assert.equal(data.items[0].title, "First episode");
  assert.equal(data.items[0].videoId, "abcdefghijk");
  assert.equal(data.items[0].thumbnail, "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
  assert.equal(data.items[0].embedUrl, "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(JSON.stringify(data).includes(API_KEY), false);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), SITE_ORIGIN);
});

test("requests the requested continuation page token", async () => {
  let upstreamUrl;
  const response = await handleYouTubeRequest(
    post({ playlistUrl: "https://www.youtube.com/playlist?list=PLabcdefghijk", pageToken: "PAGE_TWO" }),
    { YOUTUBE_API_KEY: API_KEY, YOUTUBE_IMPORT_TOKEN: "test-import-token" },
    async (url) => {
      upstreamUrl = new URL(url);
      return Response.json({ nextPageToken: "PAGE_THREE", pageInfo: { totalResults: 101 }, items: [youtubeItem("abcdefghijk", 50)] });
    },
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl.searchParams.get("pageToken"), "PAGE_TWO");
  assert.equal(data.nextPageToken, "PAGE_THREE");
});

test("lists unavailable videos as failures instead of creating broken episodes", async () => {
  const response = await handleYouTubeRequest(post({ playlistUrl: "https://www.youtube.com/playlist?list=PLabcdefghijk" }), { YOUTUBE_API_KEY: API_KEY, YOUTUBE_IMPORT_TOKEN: "test-import-token" }, async () => Response.json({
    items: [youtubeItem("abcdefghijk", 0), { snippet: { title: "Private video", position: 1 }, status: { privacyStatus: "private" } }],
  }));
  const data = await response.json();
  assert.equal(data.items.length, 1);
  assert.equal(data.failures.length, 1);
  assert.match(data.failures[0].reason, /خاص أو محذوف/);
});

test("requires both Cloudflare secrets and blocks other origins", async () => {
  const missingTokenSecret = await handleYouTubeRequest(post({ playlistUrl: "PLabcdefghijk" }), { YOUTUBE_API_KEY: API_KEY });
  assert.equal(missingTokenSecret.status, 503);
  assert.equal((await missingTokenSecret.json()).code, "import_token_missing");
  const wrongToken = await handleYouTubeRequest(post({ playlistUrl: "PLabcdefghijk" }, SITE_ORIGIN, "wrong-token"), { YOUTUBE_API_KEY: API_KEY, YOUTUBE_IMPORT_TOKEN: "test-import-token" });
  assert.equal(wrongToken.status, 401);
  assert.equal((await wrongToken.json()).code, "unauthorized");
  const missingKey = await handleYouTubeRequest(post({ playlistUrl: "PLabcdefghijk" }), { YOUTUBE_IMPORT_TOKEN: "test-import-token" });
  assert.equal(missingKey.status, 503);
  assert.equal((await missingKey.json()).code, "secret_missing");
  const blocked = await handleYouTubeRequest(post({ playlistUrl: "PLabcdefghijk" }, "https://evil.example"), { YOUTUBE_API_KEY: API_KEY, YOUTUBE_IMPORT_TOKEN: "test-import-token" });
  assert.equal(blocked.status, 403);
});

test("maps the YouTube quota response to a useful 429", async () => {
  const response = await handleYouTubeRequest(post({ playlistUrl: "PLabcdefghijk" }), { YOUTUBE_API_KEY: API_KEY, YOUTUBE_IMPORT_TOKEN: "test-import-token" }, async () => Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 }));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "quota_exceeded");
});

test("browser pagination follows page tokens until it has all 105 episodes", async () => {
  const browser = {};
  const source = readFileSync(new URL("../../youtube-import-ui.js", import.meta.url), "utf8");
  vm.runInNewContext(source, { window: browser, URL, Set, WeakMap, Map, fetch });
  const tokens = [];
  const authorization = [];
  const mockFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    tokens.push(body.pageToken || "first");
    authorization.push(init.headers.Authorization);
    const offset = !body.pageToken ? 0 : body.pageToken === "p2" ? 50 : 100;
    const count = offset === 100 ? 5 : 50;
    const items = Array.from({ length: count }, (_, index) => {
      const position = offset + index;
      return { videoId: `video_${String(position).padStart(3, "0")}`, title: `Episode ${position + 1}`, position, thumbnail: `https://i.ytimg.com/vi/video_${position}/mqdefault.jpg` };
    });
    const payload = { ok: true, items, failures: [], totalResults: 105, nextPageToken: offset === 0 ? "p2" : offset === 50 ? "p3" : "" };
    return { ok: true, status: 200, json: async () => payload };
  };
  const result = await browser.TMYouTubeImporter.fetchAllPages("https://api.example/api/youtube-playlist", "https://youtube.com/playlist?list=PLabcdefghijk", { fetchImpl: mockFetch, token: "test-import-token" });
  assert.equal(result.items.length, 105);
  assert.equal(result.pages, 3);
  assert.deepEqual(tokens, ["first", "p2", "p3"]);
  assert.deepEqual(authorization, Array(3).fill("Bearer test-import-token"));
  assert.equal(result.items[0].position, 0);
  assert.equal(result.items.at(-1).position, 104);
});

test("episode creation preserves playlist order, builds embeds and skips existing video IDs", () => {
  const browser = {};
  const source = readFileSync(new URL("../../youtube-import-ui.js", import.meta.url), "utf8");
  vm.runInNewContext(source, { window: browser, URL, Set, WeakMap, Map, fetch });
  const result = browser.TMYouTubeImporter.buildEpisodeRecords([
    { videoId: "vid-bbbbbbbbbb", title: "Second", position: 2, thumbnail: "https://i.ytimg.com/b.jpg" },
    { videoId: "vid-aaaaaaaaaa", title: "First", position: 1, thumbnail: "https://i.ytimg.com/a.jpg" },
  ], new Set(["vid-aaaaaaaaaa"]), 7);
  assert.equal(result.skipped, 1);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].number, 7);
  assert.equal(result.episodes[0].title, "Second");
  assert.equal(result.episodes[0].servers[0].url, "https://www.youtube.com/embed/vid-bbbbbbbbbb");
  assert.equal(result.episodes[0].servers[0].type, "youtube");
});
