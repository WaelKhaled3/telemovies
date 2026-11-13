(() => {
  const validURL = (value) => {
    try {
      const url = new URL(String(value || ""));
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };

  function normalizeSource(server) {
    let raw = String(server.url || "").trim();
    const iframe = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (iframe) raw = iframe[2].replace(/&amp;/g, "&");
    const url = validURL(raw);
    if (!url) return null;

    let type = String(server.type || "auto").toLowerCase();
    if (type === "auto") {
      if (/\.m3u8(?:$|[?#])/i.test(url)) type = "hls";
      else if (/\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i.test(url)) type = "mp4";
      else if (/youtu(?:be\.com|\.be)/i.test(url)) type = "youtube";
      else if (/vk\.com/i.test(url)) type = "vk";
      else if (/ok\.ru/i.test(url)) type = "ok";
      else type = "iframe";
    }
    return { url, type, name: String(server.name || "سيرفر") };
  }

  function iframeURL(source) {
    const url = new URL(source.url);
    if (source.type === "youtube") {
      const id = url.hostname.includes("youtu.be")
        ? url.pathname.slice(1)
        : url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1` : "";
    }
    if (source.type === "vk") {
      if (/video_ext\.php$/i.test(url.pathname)) return url.href;
      const match = url.href.match(/video(-?\d+)_([0-9]+)/);
      if (match) return `https://vk.com/video_ext.php?oid=${encodeURIComponent(match[1])}&id=${encodeURIComponent(match[2])}`;
      const owner = url.searchParams.get("oid");
      const video = url.searchParams.get("id");
      return owner && video ? `https://vk.com/video_ext.php?oid=${encodeURIComponent(owner)}&id=${encodeURIComponent(video)}` : url.href;
    }
    if (source.type === "ok") {
      if (/\/videoembed\//i.test(url.pathname)) return url.href;
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      return id ? `https://ok.ru/videoembed/${encodeURIComponent(id)}` : url.href;
    }
    // Other hosts (including UQload, Vidspeed and Vidrob) use the supplied embed URL.
    return source.url;
  }

  function setup(root, workId, config) {
    const isSeries = config.type === "series";
    const words = config.texts && typeof config.texts === "object" ? config.texts : {};
    const text = (key, fallback) => String(words[key] ?? "").trim() || fallback;
    const state = { season: 0, episode: 0, part: 0 };
    let hls = null;
    root.dataset.viewingReady = "1";
    root.innerHTML = `
      <div class="iv-top">
        <h2 class="iv-title"></h2>
        <p class="iv-instruction"></p>
      </div>
      <div class="iv-content">
        <div class="iv-selectors"></div>
        <div class="iv-episode-nav" hidden>
          <button type="button" data-iv-prev>الحلقة السابقة</button>
          <span aria-live="polite"></span>
          <button type="button" data-iv-next>الحلقة التالية</button>
        </div>
        <div class="iv-downloads" hidden><button type="button" class="iv-download-toggle" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/></svg><span></span></button><div class="iv-download-list" hidden></div></div><div class="iv-player" aria-live="polite"><div class="iv-empty">اختر حلقة أو سيرفراً لبدء المشاهدة.</div></div>
        <div class="iv-servers"></div>
        <p class="iv-note">التضمين يعمل بحسب سماح المصدر والمتصفح؛ لا يتجاوز الموقع قيود الاستضافة.</p>
      </div>`;

    root.querySelector(".iv-title").textContent = text(isSeries ? "titleSeries" : "titleMovie", isSeries ? "مشاهدة المسلسل" : "مشاهدة الفيلم");
    root.querySelector(".iv-instruction").textContent = text(isSeries ? "instructionSeries" : "instructionMovie", isSeries ? "اختر الموسم والحلقة، ثم اختر السيرفر." : "اختر الجزء عند توفره، ثم اختر السيرفر.");
    root.querySelector("[data-iv-prev]").textContent = text("previousEpisode", "الحلقة السابقة");
    root.querySelector("[data-iv-next]").textContent = text("nextEpisode", "الحلقة التالية");
    const selectors = root.querySelector(".iv-selectors");
    const player = root.querySelector(".iv-player");
    const serversBox = root.querySelector(".iv-servers");
    const episodeNav = root.querySelector(".iv-episode-nav");
    const downloadBox = root.querySelector(".iv-downloads");
    const downloadToggle = root.querySelector(".iv-download-toggle");
    const downloadList = root.querySelector(".iv-download-list");
    downloadToggle.addEventListener("click", () => { const opening = downloadList.hidden; downloadList.hidden = !opening; downloadToggle.setAttribute("aria-expanded", String(opening)); });
    function setDownloads(items) {
      const usable = (Array.isArray(items) ? items : []).filter(item => item && item.enabled !== false && validURL(item.url));
      downloadList.replaceChildren(); downloadList.hidden = true; downloadToggle.setAttribute("aria-expanded", "false");
      downloadBox.hidden = usable.length === 0;
      downloadToggle.querySelector("span").textContent = text(isSeries ? "downloadEpisode" : "downloadMovie", isSeries ? "تحميل الحلقة" : "تحميل الفيلم");
      usable.slice().sort((a,b)=>(+a.order||0)-(+b.order||0)).forEach(item => {
        const a = document.createElement("a"); a.className = "iv-quality"; a.href = validURL(item.url); a.target = "_blank"; a.rel = "nofollow noopener noreferrer";
        const name = String(item.quality === "custom" ? (item.customQuality || "جودة أخرى") : (item.quality || "جودة التحميل"));
        const label = document.createElement("strong"); label.textContent = name;
        const note = document.createElement("small"); note.textContent = "فتح رابط التحميل";
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("viewBox","0 0 24 24"); icon.setAttribute("fill","none"); icon.setAttribute("stroke","currentColor"); icon.setAttribute("stroke-width","2"); icon.setAttribute("aria-hidden","true");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d","M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"); icon.append(path); a.append(label,note,icon); downloadList.append(a);
      });
    }

    function clearPlayer() {
      if (hls) {
        try { hls.destroy(); } catch {}
        hls = null;
      }
      player.replaceChildren();
    }

    function play(server) {
      const source = normalizeSource(server);
      clearPlayer();
      if (!source) {
        player.textContent = "رابط المصدر غير صالح؛ استخدم رابطاً يبدأ بـ HTTP أو HTTPS.";
        return;
      }

      if (source.type === "mp4" || source.type === "hls") {
        const video = document.createElement("video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        player.append(video);
        if (source.type === "mp4" || video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = source.url;
          video.addEventListener("error", () => {
            player.innerHTML = '<p class="iv-error">تعذّر تشغيل هذا المصدر؛ جرّب سيرفراً آخر.</p>';
          }, { once: true });
          return;
        }

        const attachHls = () => {
          if (window.Hls && window.Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(source.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (!data.fatal) return;
              player.innerHTML = '<p class="iv-error">تعذّر تشغيل HLS؛ جرّب سيرفراً آخر أو Safari.</p>';
              try { hls.destroy(); } catch {}
              hls = null;
            });
          } else {
            player.innerHTML = '<p class="iv-error">هذا المتصفح لا يدعم HLS؛ جرّب سيرفراً آخر.</p>';
          }
        };

        if (window.Hls) {
          attachHls();
        } else {
          const existing = document.querySelector("script[data-hls-player]");
          if (existing) {
            existing.addEventListener("load", attachHls, { once: true });
            existing.addEventListener("error", () => { player.textContent = "تعذّر تحميل مشغل HLS."; }, { once: true });
          } else {
            const script = document.createElement("script");
            script.dataset.hlsPlayer = "1";
            script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js";
            script.onload = attachHls;
            script.onerror = () => { player.textContent = "تعذّر تحميل مشغل HLS."; };
            document.head.append(script);
          }
        }
        return;
      }

      const src = iframeURL(source);
      if (!src) {
        player.textContent = "تعذّر قراءة رابط التضمين؛ راجعه من لوحة التحكم.";
        return;
      }
      const frame = document.createElement("iframe");
      frame.src = src;
      frame.title = source.name;
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.setAttribute("webkitallowfullscreen", "");
      frame.setAttribute("mozallowfullscreen", "");
      frame.loading = "lazy";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.addEventListener("error", () => {
        player.innerHTML = '<p class="iv-error">قد تمنع الاستضافة التضمين داخل الموقع؛ جرّب سيرفراً آخر.</p>';
      }, { once: true });
      player.append(frame);
    }

    function setServers(servers, label, downloads = []) {
      setDownloads(downloads);
      const usable = (servers || []).filter((server) => server && server.enabled !== false && normalizeSource(server));
      serversBox.replaceChildren();
      if (!usable.length) {
        serversBox.innerHTML = '<p class="iv-error">لا توجد سيرفرات مفعّلة لهذا الاختيار؛ أضفها من لوحة التحكم.</p>';
        player.innerHTML = '<div class="iv-empty">لا يتوفر رابط تشغيل لهذا الاختيار بعد.</div>';
        return;
      }
      const heading = document.createElement("h3");
      heading.textContent = text("availableServers", "السيرفرات المتاحة") + (label ? ` — ${label}` : "");
      serversBox.append(heading);
      const hint = document.createElement("p");
      hint.className = "iv-server-hint";
      hint.textContent = text("chooseServer", "اختر السيرفر");
      serversBox.append(hint);
      const row = document.createElement("div");
      row.className = "iv-server-buttons";
      usable.slice().sort((a, b) => (+a.order || 0) - (+b.order || 0)).forEach((server, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "iv-server" + (index === 0 ? " active" : "");
        button.textContent = server.name || `سيرفر ${index + 1}`;
        button.onclick = () => {
          row.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          play(server);
        };
        row.append(button);
      });
      serversBox.append(row);
      row.firstElementChild?.click();
    }

    function addSelect(label, options, value, onChange) {
      const wrapper = document.createElement("label");
      wrapper.className = "iv-select-field";
      const caption = document.createElement("span");
      caption.textContent = label;
      const select = document.createElement("select");
      select.className = "iv-select";
      select.setAttribute("aria-label", label);
      options.forEach((option) => {
        const item = document.createElement("option");
        item.value = String(option.value);
        item.textContent = option.label;
        select.append(item);
      });
      select.value = String(value);
      select.onchange = () => onChange(Number(select.value));
      wrapper.append(caption, select);
      selectors.append(wrapper);
      return select;
    }

    const modes = config.display || {};
    const remembered = (() => {
      try { return JSON.parse(localStorage.getItem(`tm_watch_${workId}`) || "{}"); }
      catch { return {}; }
    })();

    if (!isSeries) {
      const parts = Array.isArray(config.parts) && config.parts.length
        ? config.parts
        : [{ title: "الفيلم", servers: config.servers || [], downloads: config.downloads || [] }];
      const partMode = modes.part || "auto";
      const showPart = partMode === "show" || (partMode === "auto" && parts.length > 1);
      if (showPart) {
        addSelect(text("choosePart", "اختر الجزء"), parts.map((part, index) => ({ value: index, label: part.title || `الجزء ${part.number || index + 1}` })), 0, (index) => {
          state.part = index;
          setServers(parts[index].servers, parts[index].title || `الجزء ${index + 1}`, parts[index].downloads || config.downloads || []);
        });
      }
      setServers(parts[0].servers, parts[0].title || "الفيلم", parts[0].downloads || config.downloads || []);
      return;
    }

    const seasons = (Array.isArray(config.seasons) ? config.seasons : [])
      .slice().sort((a, b) => (+a.number || 0) - (+b.number || 0));
    if (!seasons.length) {
      selectors.innerHTML = '<p class="iv-error">لم تتم إضافة مواسم لهذا المسلسل بعد.</p>';
      return;
    }
    const orderedEpisodes = (seasonIndex) => (seasons[seasonIndex]?.episodes || [])
      .slice().sort((a, b) => (+a.number || 0) - (+b.number || 0));
    const seasonMode = modes.season || "auto";
    const episodeMode = modes.episode || "auto";
    const showSeason = seasonMode === "show" || (seasonMode === "auto" && seasons.length > 1);
    let seasonSelect = null;
    let episodeSelect = null;

    function episodeServers(episodeIndex) {
      state.episode = episodeIndex;
      const episode = orderedEpisodes(state.season)[episodeIndex];
      try { localStorage.setItem(`tm_watch_${workId}`, JSON.stringify(state)); } catch {}
      setServers(episode?.servers || [], `${seasons[state.season].title || `الموسم ${state.season + 1}`} · ${episode?.title || `الحلقة ${episode?.number || episodeIndex + 1}`}`, episode?.downloads || []);
      syncEpisodeNav();
    }

    function renderEpisodeSelect(preferredIndex = 0) {
      if (episodeSelect) episodeSelect.closest(".iv-select-field")?.remove();
      episodeSelect = null;
      const episodes = orderedEpisodes(state.season);
      if (!episodes.length) {
        setServers([], seasons[state.season].title || `الموسم ${state.season + 1}`);
        return;
      }
      const showEpisode = episodeMode === "show" || (episodeMode === "auto" && episodes.length > 1);
      const selected = Math.max(0, Math.min(preferredIndex, episodes.length - 1));
      if (showEpisode) {
        episodeSelect = addSelect(text("chooseEpisode", "اختر الحلقة"), episodes.map((episode, index) => ({
          value: index,
          label: episode.title || `الحلقة ${episode.number || index + 1}`
        })), selected, episodeServers);
      }
      episodeServers(selected);
    }

    if (showSeason) {
      const seasonIndex = Number.isInteger(remembered.season) && seasons[remembered.season]
        ? remembered.season : 0;
      state.season = seasonIndex;
      seasonSelect = addSelect(text("chooseSeason", "اختر الموسم"), seasons.map((season, index) => ({
        value: index,
        label: `${season.title || `الموسم ${season.number || index + 1}`} · ${orderedEpisodes(index).length} حلقات`
      })), seasonIndex, (index) => {
        state.season = index;
        renderEpisodeSelect(0);
        try { localStorage.setItem(`tm_watch_${workId}`, JSON.stringify(state)); } catch {}
      });
    } else {
      state.season = 0;
    }

    const savedEpisode = state.season === remembered.season && Number.isInteger(remembered.episode)
      ? remembered.episode : 0;
    renderEpisodeSelect(savedEpisode);

    function flatEpisodes() {
      return seasons.flatMap((season, seasonIndex) => orderedEpisodes(seasonIndex).map((episode, episodeIndex) => ({ seasonIndex, episodeIndex })));
    }
    function currentFlatIndex() {
      return flatEpisodes().findIndex((item) => item.seasonIndex === state.season && item.episodeIndex === state.episode);
    }
    function syncEpisodeNav() {
      const flat = flatEpisodes();
      const index = currentFlatIndex();
      episodeNav.hidden = flat.length <= 1;
      episodeNav.querySelector("[data-iv-prev]").disabled = index <= 0;
      episodeNav.querySelector("[data-iv-next]").disabled = index < 0 || index >= flat.length - 1;
      episodeNav.querySelector("span").textContent = index >= 0 ? `الحلقة ${index + 1} من ${flat.length}` : "";
    }
    function goRelative(delta) {
      const next = flatEpisodes()[currentFlatIndex() + delta];
      if (!next) return;
      if (seasonSelect) seasonSelect.value = String(next.seasonIndex);
      state.season = next.seasonIndex;
      renderEpisodeSelect(next.episodeIndex);
    }
    episodeNav.querySelector("[data-iv-prev]").onclick = () => goRelative(-1);
    episodeNav.querySelector("[data-iv-next]").onclick = () => goRelative(1);
  }

  async function initialize(root) {
    try {
      const viewingFile = root.dataset.viewingFile || ("/viewing/" + encodeURIComponent(workId) + ".json");
      const response = await fetch(viewingFile + "?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const work = await response.json();
      if (String(work.id) !== root.dataset.viewingWork || !work?.viewing || work.viewing.enabled !== true) {
        root.hidden = true;
        return;
      }
      setup(root, work.id, work.viewing);
    } catch {
      root.innerHTML = '<p class="iv-error">تعذّر تحميل بيانات المشاهدة لهذا العمل.</p>';
      root.hidden = false;
    }
  }

  const initialized = new WeakSet();
  function initializeButtons() {
    document.querySelectorAll("[data-viewing-work]").forEach((root) => {
      if (initialized.has(root)) return;
      initialized.add(root);
      const selector = `[data-viewing-open="${CSS.escape(root.dataset.viewingWork)}"]`;
      const button = document.querySelector(selector);
      if (!button) {
        initialize(root);
        return;
      }
      button.hidden = false;
      button.addEventListener("click", async () => {
        root.hidden = false;
        button.setAttribute("aria-expanded", "true");
        if (root.dataset.viewingReady !== "1") await initialize(root);
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", initializeButtons);
  document.addEventListener("tm:detail-ready", initializeButtons);
})();
