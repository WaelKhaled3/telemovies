(() => {
  const DEFAULT_API_URL = "https://telemovies-youtube-import.wk7.workers.dev/api/youtube-playlist";
  const importState = new WeakMap();

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function field(labelText, input) {
    const wrap = node("div", "field tm-yt-field");
    wrap.append(node("label", "", labelText), input);
    return wrap;
  }

  function findYouTubeId(value) {
    const raw = String(value || "").trim();
    const iframe = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
    try {
      const url = new URL(iframe ? iframe[2].replace(/&amp;/g, "&") : raw);
      const host = url.hostname.toLowerCase();
      if (host === "youtu.be" || host.endsWith(".youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
      if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")) {
        return url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || "";
      }
    } catch {}
    return "";
  }

  function existingVideoIds(viewing) {
    const ids = new Set();
    for (const season of Array.isArray(viewing.seasons) ? viewing.seasons : []) {
      for (const episode of Array.isArray(season.episodes) ? season.episodes : []) {
        if (episode.videoId) ids.add(String(episode.videoId));
        for (const server of Array.isArray(episode.servers) ? episode.servers : []) {
          const id = findYouTubeId(server.url);
          if (id) ids.add(id);
        }
      }
    }
    return ids;
  }

  async function fetchAllPages(apiEndpoint, playlistUrl, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const onProgress = options.onProgress || (() => {});
    const items = [];
    const failures = [];
    const seenIds = new Set();
    const usedPageTokens = new Set();
    let pageToken = "";
    let totalResults = 0;
    let page = 0;
    do {
      page += 1;
      if (page > 1000) {
        failures.push({ title: "القائمة", reason: "تجاوزت القائمة الحد الآمن لعدد الصفحات (1000)." });
        break;
      }
      let response;
      let payload;
      try {
        response = await fetchImpl(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
          cache: "no-store",
          body: JSON.stringify({ playlistUrl, ...(pageToken ? { pageToken } : {}) }),
        });
        payload = await response.json();
      } catch (error) {
        const reason = error?.message || "تعذّر الاتصال بخدمة الاستيراد.";
        if (items.length) {
          failures.push({ title: `الصفحة ${page}`, reason });
          break;
        }
        throw new Error(reason);
      }
      if (!response.ok || payload?.ok === false) {
        const reason = payload?.message || `فشل طلب الصفحة ${page} (HTTP ${response.status}).`;
        if (items.length) {
          failures.push({ title: `الصفحة ${page}`, reason });
          break;
        }
        throw new Error(reason);
      }
      totalResults = Number(payload.totalResults || totalResults || 0);
      for (const item of Array.isArray(payload.items) ? payload.items : []) {
        const videoId = String(item.videoId || "").trim();
        if (!videoId) {
          failures.push({ position: item.position, title: item.title || "عنصر بلا عنوان", reason: "معرّف الفيديو غير موجود." });
          continue;
        }
        if (seenIds.has(videoId)) {
          failures.push({ position: item.position, title: item.title || videoId, reason: "الفيديو مكرر داخل قائمة التشغيل؛ تم تجاهل النسخة الإضافية." });
          continue;
        }
        seenIds.add(videoId);
        items.push({
          videoId,
          title: String(item.title || "").trim() || `فيديو ${videoId}`,
          position: Number.isInteger(Number(item.position)) ? Number(item.position) : items.length,
          thumbnail: String(item.thumbnail || ""),
          embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
        });
      }
      for (const failure of Array.isArray(payload.failures) ? payload.failures : []) failures.push(failure);
      pageToken = String(payload.nextPageToken || "");
      onProgress({ page, loaded: items.length, total: totalResults });
      if (pageToken && usedPageTokens.has(pageToken)) {
        failures.push({ title: `الصفحة ${page}`, reason: "أعاد YouTube رمز صفحة مكرراً؛ أوقفنا الجلب لتجنب تكرار الحلقة." });
        pageToken = "";
      } else if (pageToken) {
        usedPageTokens.add(pageToken);
      }
    } while (pageToken);
    items.sort((a, b) => a.position - b.position);
    return { items, failures, totalResults, pages: page };
  }

  function buildEpisodeRecords(selectedItems, alreadyAddedIds, firstNumber) {
    const seen = new Set(alreadyAddedIds || []);
    const ordered = [...selectedItems].sort((a, b) => a.position - b.position);
    const episodes = [];
    let skipped = 0;
    let number = firstNumber;
    for (const item of ordered) {
      const id = String(item.videoId || "").trim();
      if (!id || seen.has(id)) {
        skipped += 1;
        continue;
      }
      seen.add(id);
      episodes.push({
        number: number++,
        title: String(item.title || `فيديو ${id}`),
        videoId: id,
        thumbnail: String(item.thumbnail || ""),
        playlistPosition: Number(item.position) || 0,
        servers: [{ name: "YouTube", url: `https://www.youtube.com/embed/${encodeURIComponent(id)}`, type: "youtube", enabled: true }],
        downloads: [],
      });
    }
    return { episodes, skipped };
  }

  function safeEndpoint(value) {
    try {
      const url = new URL(String(value || "").trim());
      const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
      if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return "";
      if (url.username || url.password) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function mount(root, options) {
    const viewing = options.viewing;
    if (!Array.isArray(viewing.seasons)) viewing.seasons = [];
    let state = importState.get(viewing);
    if (!state) {
      state = { items: [], failures: [], selected: new Set(), totalResults: 0, pages: 0, report: "" };
      importState.set(viewing, state);
    }

    const card = node("section", "view-admin-card tm-yt-import");
    const header = node("div", "tm-yt-head");
    header.append(node("h3", "", "استيراد حلقات من YouTube"));
    card.append(header);
    card.append(node("p", "muted", "الصق رابط Playlist عامة. تُجلب الحلقات بالترتيب عبر YouTube Data API، ثم عاينها وحدد ما تريد إضافته إلى الموسم."));

    const endpoint = node("input");
    endpoint.type = "url";
    endpoint.dir = "ltr";
    endpoint.autocomplete = "url";
    endpoint.value = options.getEndpoint?.() || DEFAULT_API_URL;
    endpoint.placeholder = DEFAULT_API_URL;
    endpoint.addEventListener("change", () => options.setEndpoint?.(endpoint.value.trim()));
    card.append(field("عنوان خدمة Cloudflare Worker", endpoint));
    const tokenInput = node("input");
    tokenInput.type = "password";
    tokenInput.dir = "ltr";
    tokenInput.autocomplete = "off";
    tokenInput.placeholder = "رمز حماية الاستيراد";
    try { tokenInput.value = sessionStorage.getItem("tm_youtube_import_token") || ""; } catch {}
    tokenInput.addEventListener("input", () => { try { if (tokenInput.value) sessionStorage.setItem("tm_youtube_import_token", tokenInput.value); else sessionStorage.removeItem("tm_youtube_import_token"); } catch {} });
    card.append(field("رمز الاستيراد الخاص (Cloudflare Secret: YOUTUBE_IMPORT_TOKEN)", tokenInput));
    card.append(node("p", "muted tm-yt-help", "يبقى مفتاح YouTube في Cloudflare Secret ولا يظهر في اللوحة. رمز الحماية يُحفظ مؤقتاً في جلسة هذا المتصفح فقط، ولا يُضاف إلى films.json."));

    const playlist = node("input");
    playlist.type = "url";
    playlist.dir = "ltr";
    playlist.placeholder = "https://www.youtube.com/playlist?list=PL...";
    const target = node("select");
    const targetField = field("إضافة الحلقات إلى", target);
    const controls = node("div", "tm-yt-controls");
    const fetchButton = node("button", "", "جلب الحلقات");
    fetchButton.type = "button";
    controls.append(field("رابط YouTube Playlist", playlist), targetField, fetchButton);
    card.append(controls);

    const status = node("p", "muted tm-yt-status", "لم تُجلب قائمة بعد.");
    status.setAttribute("role", "status");
    card.append(status);
    const previewHeader = node("div", "tm-yt-preview-head");
    const selectAllLabel = node("label", "check tm-yt-select-all");
    const selectAll = node("input");
    selectAll.type = "checkbox";
    selectAllLabel.append(selectAll, document.createTextNode(" تحديد كل الحلقات المتاحة"));
    const selectedCount = node("span", "muted", "المحدد: 0");
    previewHeader.append(selectAllLabel, selectedCount);
    card.append(previewHeader);
    const preview = node("div", "tm-yt-preview");
    card.append(preview);
    const failuresBox = node("div", "tm-yt-failures");
    failuresBox.hidden = true;
    const failuresTitle = node("strong", "", "تعذر جلب بعض العناصر");
    const failuresList = node("ul");
    failuresBox.append(failuresTitle, failuresList);
    card.append(failuresBox);
    const addButton = node("button", "green tm-yt-add", "إضافة المحدد إلى الموسم");
    addButton.type = "button";
    addButton.disabled = true;
    card.append(addButton);
    root.append(card);

    function seasonChoices() {
      const previous = target.value;
      target.replaceChildren();
      viewing.seasons.forEach((season, index) => {
        const option = node("option", "", `الموسم ${season.number || index + 1}${season.title ? " — " + season.title : ""}`);
        option.value = String(index);
        target.append(option);
      });
      const create = node("option", "", "إنشاء موسم جديد");
      create.value = "new";
      target.append(create);
      if ([...target.options].some((option) => option.value === previous)) target.value = previous;
      else target.value = viewing.seasons.length ? "0" : "new";
    }

    function selectedIds() {
      return existingVideoIds(viewing);
    }

    function updateSelectionSummary() {
      const existing = selectedIds();
      let eligible = 0;
      let chosen = 0;
      for (const item of state.items) {
        if (existing.has(item.videoId)) continue;
        eligible += 1;
        if (state.selected.has(item.videoId)) chosen += 1;
      }
      selectedCount.textContent = `المحدد: ${chosen} من ${eligible}`;
      addButton.disabled = chosen === 0;
      const all = eligible > 0 && chosen === eligible;
      const some = chosen > 0 && chosen < eligible;
      selectAll.checked = all;
      selectAll.indeterminate = some;
      selectAll.disabled = eligible === 0;
    }

    function renderPreview() {
      preview.replaceChildren();
      const existing = selectedIds();
      if (!state.items.length) preview.append(node("p", "muted", "لا توجد حلقات للمعاينة."));
      state.items.forEach((item) => {
        const duplicate = existing.has(item.videoId);
        const row = node("div", "tm-yt-item" + (duplicate ? " is-duplicate" : ""));
        const check = node("input");
        check.type = "checkbox";
        check.checked = !duplicate && state.selected.has(item.videoId);
        check.disabled = duplicate;
        check.setAttribute("aria-label", `اختيار ${item.title}`);
        check.addEventListener("change", () => {
          if (check.checked) state.selected.add(item.videoId);
          else state.selected.delete(item.videoId);
          updateSelectionSummary();
        });
        const image = node("img", "tm-yt-thumb");
        image.loading = "lazy";
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.src = item.thumbnail || "";
        image.addEventListener("error", () => { image.hidden = true; }, { once: true });
        const details = node("div", "tm-yt-details");
        details.append(node("strong", "", `${item.position + 1}. ${item.title}`));
        details.append(node("small", "", `Video ID: ${item.videoId}`));
        if (duplicate) details.append(node("small", "tm-yt-duplicate-label", "مضافة مسبقاً لهذا المسلسل؛ لن تُكرر."));
        row.append(check, image, details);
        preview.append(row);
      });
      failuresList.replaceChildren();
      failuresBox.hidden = state.failures.length === 0;
      state.failures.forEach((failure) => {
        const label = failure.position === undefined ? (failure.title || "عنصر") : `العنصر ${Number(failure.position) + 1}: ${failure.title || ""}`;
        failuresList.append(node("li", "", `${label} — ${failure.reason || "تعذر الجلب."}`));
      });
      updateSelectionSummary();
    }

    selectAll.addEventListener("change", () => {
      const existing = selectedIds();
      for (const item of state.items) {
        if (existing.has(item.videoId)) continue;
        if (selectAll.checked) state.selected.add(item.videoId);
        else state.selected.delete(item.videoId);
      }
      renderPreview();
    });
    target.addEventListener("change", renderPreview);

    fetchButton.addEventListener("click", async () => {
      const apiUrl = safeEndpoint(endpoint.value);
      if (!apiUrl) {
        status.textContent = "أدخل عنوان HTTPS صالحاً لخدمة Worker. يُسمح بـ HTTP على localhost للاختبار المحلي فقط.";
        status.className = "muted tm-yt-status is-error";
        return;
      }
      if (!tokenInput.value.trim()) {
        status.textContent = "أدخل رمز حماية الاستيراد الذي أضفته إلى Cloudflare Secret باسم YOUTUBE_IMPORT_TOKEN.";
        status.className = "muted tm-yt-status is-error";
        return;
      }
      if (!playlist.value.trim()) {
        status.textContent = "أدخل رابط Playlist أولاً.";
        status.className = "muted tm-yt-status is-error";
        return;
      }
      options.setEndpoint?.(endpoint.value.trim());
      fetchButton.disabled = true;
      state.items = [];
      state.failures = [];
      state.selected = new Set();
      state.report = "";
      status.className = "muted tm-yt-status";
      status.textContent = "جارٍ بدء الجلب…";
      renderPreview();
      try {
        const result = await fetchAllPages(apiUrl, playlist.value.trim(), {
          token: tokenInput.value.trim(),
          onProgress: ({ page, loaded, total }) => {
            status.textContent = total ? `جلب الصفحة ${page}… ${loaded} من ${total} حلقة.` : `جلب الصفحة ${page}… تم العثور على ${loaded} حلقة.`;
          },
        });
        state.items = result.items;
        state.failures = result.failures;
        state.totalResults = result.totalResults;
        state.pages = result.pages;
        for (const item of state.items) if (!selectedIds().has(item.videoId)) state.selected.add(item.videoId);
        const summary = `تم جلب ${state.items.length} حلقة في ${result.pages} صفحة` + (result.totalResults ? ` من أصل ${result.totalResults}` : "") + `؛ تعذر جلب ${state.failures.length}.`;
        status.textContent = summary;
        status.className = "muted tm-yt-status" + (state.failures.length ? " has-warning" : " is-success");
      } catch (error) {
        status.textContent = error?.message || "تعذّر جلب قائمة التشغيل.";
        status.className = "muted tm-yt-status is-error";
      } finally {
        fetchButton.disabled = false;
        renderPreview();
      }
    });

    addButton.addEventListener("click", () => {
      const existing = selectedIds();
      const chosen = state.items.filter((item) => state.selected.has(item.videoId));
      const choice = target.value;
      let season = choice === "new" ? null : viewing.seasons[Number(choice)];
      const firstNumber = season
        ? Math.max(0, ...season.episodes.map((episode) => Number(episode.number) || 0)) + 1
        : 1;
      const built = buildEpisodeRecords(chosen, existing, firstNumber);
      if (!built.episodes.length) {
        status.textContent = "كل الحلقات المحددة مضافة مسبقاً، ولم يُضف أي تكرار.";
        status.className = "muted tm-yt-status has-warning";
        return;
      }
      if (!season) {
        const number = Math.max(0, ...viewing.seasons.map((item, index) => Number(item.number) || index + 1)) + 1;
        season = { number, title: `الموسم ${number}`, episodes: [] };
        viewing.seasons.push(season);
        target.value = String(viewing.seasons.length - 1);
      }
      if (!Array.isArray(season.episodes)) season.episodes = [];
      season.episodes.push(...built.episodes);
      season.episodes.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
      state.report = `أُضيفت ${built.episodes.length} حلقة إلى الموسم ${season.number || "المحدد"}. تم تجاوز ${built.skipped} حلقة مكررة. تعذر جلب ${state.failures.length} عنصر.`;
      status.textContent = state.report;
      status.className = "muted tm-yt-status is-success";
      options.onAdded?.(state.report);
      renderPreview();
    });

    seasonChoices();
    if (state.report) {
      status.textContent = state.report;
      status.className = "muted tm-yt-status is-success";
    }
    renderPreview();
    return card;
  }

  window.TMYouTubeImporter = {
    DEFAULT_API_URL,
    fetchAllPages,
    buildEpisodeRecords,
    mount,
  };
})();
