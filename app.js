(()=>{
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
let dp;const ib=document.getElementById("installBtn");
addEventListener("beforeinstallprompt",e=>{e.preventDefault();dp=e;if(ib)ib.hidden=false});
if(ib){if(/iphone|ipad|ipod/i.test(navigator.userAgent)&&!navigator.standalone)ib.hidden=false;
ib.onclick=()=>{if(dp){dp.prompt();dp=null;ib.hidden=true}else alert("في آيفون: اضغط زر المشاركة في المتصفح ثم «إضافة إلى الشاشة الرئيسية».")}}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-share]");if(!b)return;const d={title:document.title,url:location.href};
if(navigator.share){try{await navigator.share(d)}catch{}}else{try{await navigator.clipboard.writeText(d.url);b.textContent="✓ تم نسخ الرابط"}catch{prompt("انسخ الرابط:",d.url)}}});
const setMenu=o=>{const d=document.getElementById("drawer");if(!d)return;d.classList.toggle("open",o);d.setAttribute("aria-hidden",String(!o));document.body.style.overflow=o?"hidden":""};
document.addEventListener("click",e=>{if(e.target.closest("[data-menu]")){const d=document.getElementById("drawer");setMenu(!(d&&d.classList.contains("open")));return}if(e.target.closest("#drawer a"))setMenu(false)});
document.addEventListener("keydown",e=>{if(e.key==="Escape")setMenu(false)});
document.addEventListener("click",async e=>{const r=e.target.closest("[data-report]");if(!r)return;try{await navigator.clipboard.writeText(r.dataset.report);const t=document.createElement("div");t.className="toast";t.textContent=r.dataset.copied||"";document.body.append(t);setTimeout(()=>t.remove(),4200)}catch{}});
function parseTrailer(u){u=String(u||"").trim();if(!u)return null;
if(u[0]==="<"){const m=u.match(/<iframe[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i)||u.match(/<(?:video|source)[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);if(!m)return null;u=m[1].trim().replace(/&amp;/g,"&");if(u.startsWith("//"))u="https:"+u}
let m=u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);if(m)return{t:"yt",id:m[1]};if(/^[\w-]{11}$/.test(u))return{t:"yt",id:u};if(!/^https?:\/\//i.test(u))return null;
if(/\.m3u8(\?|#|$)/i.test(u))return{t:"hls",u};if(/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u))return{t:"video",u};return{t:"embed",u}}
function openPlayer(url,o){o=o||{};const p=parseTrailer(url);if(!p)return;const ov=document.createElement("div");ov.className="pl-ov";
ov.innerHTML='<div class="pl-box" role="dialog" aria-modal="true"><div class="pl-bar"><span class="pl-t"></span><a class="pl-open" target="_blank" rel="noopener noreferrer"></a><button class="pl-x" type="button" aria-label="x">×</button></div><div class="pl-frame"><div class="pl-spin"></div></div></div>';
ov.querySelector(".pl-t").textContent=o.title||"";const op=ov.querySelector(".pl-open");op.textContent=o.open||"فتح في صفحة جديدة";const src=p.t==="yt"?"https://www.youtube.com/watch?v="+p.id:p.u;op.href=src;
const fr=ov.querySelector(".pl-frame"),sp=ov.querySelector(".pl-spin");
const esc=e=>{if(e.key==="Escape")close()},close=()=>{ov.remove();document.body.style.overflow="";document.removeEventListener("keydown",esc)};
ov.addEventListener("click",e=>{if(e.target===ov||e.target.closest(".pl-x"))close()});document.addEventListener("keydown",esc);
const frame=s=>{const f=document.createElement("iframe");f.src=s;f.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";f.allowFullscreen=true;f.addEventListener("load",()=>sp.remove());return f};
const fail=()=>{fr.replaceChildren();const m=document.createElement("p");m.textContent=o.err||"تعذّر تشغيل الفيديو.";fr.append(m)};
if(p.t==="yt")fr.append(frame("https://www.youtube-nocookie.com/embed/"+p.id+"?autoplay=1&rel=0&playsinline=1"));
else if(p.t==="embed"){const f=frame(p.u);f.referrerPolicy="no-referrer";f.setAttribute("sandbox","allow-scripts allow-same-origin allow-presentation allow-fullscreen");fr.append(f)}
else{const v=document.createElement("video");v.controls=true;v.autoplay=true;v.playsInline=true;v.addEventListener("error",fail);v.addEventListener("loadeddata",()=>sp.remove());fr.append(v);
if(p.t==="video"||v.canPlayType("application/vnd.apple.mpegurl"))v.src=p.u;else{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js";s.onload=()=>{if(window.Hls&&Hls.isSupported()){const h=new Hls();h.loadSource(p.u);h.attachMedia(v);h.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)fail()})}else fail()};s.onerror=fail;document.head.append(s)}}
document.body.append(ov);document.body.style.overflow="hidden"}
document.addEventListener("click",e=>{const b=e.target.closest("[data-trailer]");if(b){e.preventDefault();openPlayer(b.dataset.trailer,{err:b.dataset.err,title:b.dataset.title,open:b.dataset.open})}});
})();
