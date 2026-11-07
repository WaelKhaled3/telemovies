// TeleMovies SEO builder — Node 18+, بدون مكتبات. يعمل تلقائياً عبر GitHub Actions.
const fs=require("fs"),pt=require("path");
const SITE="https://telemovies.wk7.workers.dev"; // دومين الموقع بدون / في النهاية — غيّره إذا ربطت دومين خاص
const NAME="TeleMovies";
const data=JSON.parse(fs.readFileSync("films.json","utf8"));
const movies=Array.isArray(data.movies)?data.movies:[],cats=Array.isArray(data.categories)?data.categories:[];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slugify=t=>String(t||"").normalize("NFKC").replace(/\p{M}/gu,"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,"");
const link=v=>{try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:""}catch{return ""}};
const write=(p,s)=>{fs.mkdirSync(pt.dirname(p),{recursive:true});fs.writeFileSync(p,s)};
const used=new Set();
movies.forEach((m,i)=>{let s=slugify(m.title)+(m.year?"-"+slugify(m.year):"")||"work-"+(i+1);if(used.has(s))s+="-"+(i+1);used.add(s);m._s=s});
const CMAP={"أفلام":"movies","أكشن":"action","دراما":"drama","مغامرة":"adventure","كوميدي":"comedy","رعب":"horror","خيال علمي":"sci-fi","مسلسلات سورية":"syrian-series"};
const cslug=c=>CMAP[c]||(/^[\x00-\x7f]+$/.test(slugify(c))&&slugify(c))||"cat-"+(cats.indexOf(c)+1);
const mp=m=>encodeURI("/movie/"+m._s+"/"),cp=c=>"/category/"+cslug(c)+"/",abs=p=>p.startsWith("/")?SITE+p:p;
const isSeries=m=>/مسلسل|series/i.test(m.category||""),kind=m=>isSeries(m)?"مسلسل":"فيلم";
function poster(m,i){const im=String(m.image||""),d=/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/s.exec(im);
 if(d){const f=`posters/${String(m.id||i).replace(/[^\w-]/g,"")}.${d[1]==="jpeg"?"jpg":d[1]}`;write(f,Buffer.from(d[2],"base64"));return "/"+f}
 return im&&!/^https?:/.test(im)?"/"+im.replace(/^\//,""):im}
movies.forEach((m,i)=>m._p=poster(m,i));
const act=cats.filter(c=>movies.some(m=>m.category===c));
const catLinks=`<nav class="cats" aria-label="الأقسام">${act.map(c=>`<a href="${esc(cp(c))}">${esc(c)}</a>`).join("")}</nav>`;
const card=m=>`<a class="movie" href="${esc(mp(m))}"><div class="poster"><img src="${esc(m._p.replace("/t/p/w500/","/t/p/w342/"))}" alt="${esc("بوستر "+kind(m)+" "+m.title)}" loading="lazy" width="300" height="450"></div><h3>${esc(m.title)}</h3><small>${esc([m.year,m.category].filter(Boolean).join(" · "))}</small></a>`;
const meta=({title,desc,path,img,type="website"})=>{const url=SITE+path;return `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><meta property="og:site_name" content="${NAME}"><meta property="og:locale" content="ar_AR"><meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${img?`<meta property="og:image" content="${esc(abs(img))}">`:""}<meta name="twitter:card" content="${img?"summary_large_image":"summary"}">`};
const ld=a=>a.map(j=>`<script type="application/ld+json">${JSON.stringify(j).replace(/</g,"\\u003c")}</script>`).join("");
const crumbs=a=>({"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:a.map(([n,p],i)=>({"@type":"ListItem",position:i+1,name:n,item:SITE+p}))});
const page=(head,body)=>`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap"><link rel="stylesheet" href="/site.css"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0e1621"><link rel="apple-touch-icon" href="/icon-192.png"><script src="/app.js" defer></script></head><body><header><a class="logo" href="/">Tele<span>Movies</span></a><nav><a href="/">الرئيسية</a><a href="/#library">المكتبة</a></nav></header>${body}<footer>${catLinks}<p class="legal"><a href="/dmca">DMCA</a> · <a href="/privacy">الخصوصية</a> · <a href="/contact">اتصل بنا</a></p><button id="installBtn" class="btn" hidden type="button">📲 ثبّت التطبيق</button><p>© ${new Date().getFullYear()} ${NAME}</p><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></footer></body></html>`;
const btn=(l,u,c)=>{u=link(u);return u?`<a class="action-btn" href="${esc(u)}" target="_blank" rel="nofollow noopener noreferrer" style="background:${c}">${esc(l)}</a>`:""};
const color=c=>/^#[0-9a-f]{3,8}$/i.test(c||"")?c:"#229ed9";
fs.rmSync("movie",{recursive:true,force:true});fs.rmSync("category",{recursive:true,force:true});
for(const m of movies){
 const k=kind(m),y=m.year?` (${m.year})`:"",path=mp(m),text=String(m.description||"").replace(/\s+/g," ").trim();
 const summary=`${m.title}${y} هو ${k}${m.category?` ضمن قسم «${m.category}»`:""} متوفر على تيليغرام. تجد هنا وصف العمل وروابط الوصول إليه وطريقة المشاهدة.`;
 const desc=text?text.slice(0,150)+(text.length>150?"…":""):summary;
 const btns=btn("مشاهدة",m.watchLink||m.link,"#229ed9")+btn("تحميل",m.downloadLink,"#168b70")+btn("رابط الرسالة",m.telegramMessageLink,"#287db5")+btn("رابط القناة",m.telegramChannelLink,"#536d83")+(Array.isArray(m.customButtons)?m.customButtons:[]).filter(b=>b&&b.enabled!==false).map(b=>btn(b.label,b.url,color(b.color))).join("");
 const rel=movies.filter(x=>x!==m&&x.category===m.category).slice(0,5);
 const j=[{"@context":"https://schema.org","@type":isSeries(m)?"TVSeries":"Movie",name:m.title,url:SITE+path,description:text||summary,...(m._p?{image:abs(m._p)}:{}),...(m.titleAr?{alternateName:m.titleAr}:{}),...(m.category?{genre:m.category}:{}),...(m.year?{dateCreated:String(m.year)}:{})},crumbs([["الرئيسية","/"],...(m.category?[[m.category,cp(m.category)]]:[]),[m.title,path]])];
 write(`movie/${m._s}/index.html`,page(meta({title:`${m.title}${y} – ${k} على تيليغرام | ${NAME}`,desc,path,img:m._p,type:isSeries(m)?"video.tv_show":"video.movie"})+ld(j),
 `<main class="wrap"><nav class="crumbs"><a href="/">الرئيسية</a> › ${m.category?`<a href="${esc(cp(m.category))}">${esc(m.category)}</a> › `:""}<span>${esc(m.title)}</span></nav><article class="detail">${m._p?`<img src="${esc(m._p)}" alt="${esc("بوستر "+k+" "+m.title)}" width="300" height="450" fetchpriority="high">`:""}<div class="detail-body"><h1>${esc(m.title+y)}</h1><p class="meta">${esc([k,m.category,m.year,m.titleAr].filter(Boolean).join(" · "))}</p><p class="lead">${esc(summary)}</p>${text?`<p>${esc(text)}</p>`:""}${m.viewingNote?`<p class="view-note">${esc(m.viewingNote)}</p>`:""}${m.viewingInstructions?`<p class="instructions">${esc(m.viewingInstructions)}</p>`:""}<div class="buttons">${btns}<button type="button" class="action-btn" data-share>مشاركة 🔗</button></div>${btns?`<h2>أين أشاهد ${esc(k+" "+m.title)} على تيليغرام؟</h2><p>يمكنك الوصول إلى «${esc(m.title)}» عبر الأزرار أعلاه التي تفتح الرسالة أو القناة على تيليغرام مباشرة.</p>`:""}</div></article>${rel.length?`<section><h2>أعمال مشابهة</h2><div class="movies">${rel.map(card).join("")}</div></section>`:""}</main>`));
}
for(const c of act){const list=movies.filter(m=>m.category===c),path=cp(c);
 write(`category/${cslug(c)}/index.html`,page(meta({title:`${c} على تيليغرام – قائمة الأعمال المتوفرة | ${NAME}`,desc:`تصفّح ${list.length} عمل ضمن قسم «${c}» المتوفرة على تيليغرام مع الوصف وروابط الوصول.`,path})+ld([{"@context":"https://schema.org","@type":"CollectionPage",name:c,url:SITE+path,mainEntity:{"@type":"ItemList",itemListElement:list.map((m,i)=>({"@type":"ListItem",position:i+1,url:SITE+mp(m)}))}},crumbs([["الرئيسية","/"],[c,path]])]),
 `<main class="wrap"><h1>${esc(c)} على تيليغرام</h1><p class="lead">${list.length} عمل متوفر ضمن قسم «${esc(c)}».</p><div class="movies">${list.map(card).join("")}</div></main>`))}
let h=fs.readFileSync("index.html","utf8");
const swap=(t,s)=>{const r=new RegExp(`<!--${t}-->[\\s\\S]*?<!--/${t}-->`);if(!r.test(h))throw Error("marker missing: "+t);h=h.replace(r,()=>`<!--${t}-->${s}<!--/${t}-->`)};
swap("SEO_HEAD",meta({title:`${NAME} | دليل الأفلام والمسلسلات المتوفرة على تيليغرام`,desc:"دليل عربي لأفلام ومسلسلات تيليغرام: ابحث عن عملك المفضل، تعرّف على وصفه وسنة إصداره، واعرف أين تجده على تيليغرام.",path:"/",img:movies[0]&&movies[0]._p})+ld([{"@context":"https://schema.org","@type":"WebSite",name:NAME,url:SITE+"/",inLanguage:"ar"}])+`<script>window.TM_BUILT=${JSON.stringify(movies.map(m=>m._s)).replace(/</g,"\\u003c")}</script>`);
swap("SEO_LIST",movies.map(card).join(""));swap("SEO_CATS",catLinks);
fs.writeFileSync("index.html",h);
write("sitemap.xml",`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/",...act.map(cp),...movies.map(mp),"/dmca","/privacy","/contact"].map(u=>`<url><loc>${esc(SITE+u)}</loc></url>`).join("")}</urlset>`);
write("robots.txt",`User-agent: *\nAllow: /\n\n${["GPTBot","OAI-SearchBot","ChatGPT-User","ClaudeBot","Claude-SearchBot","PerplexityBot","Google-Extended","Applebot-Extended"].map(b=>`User-agent: ${b}\nAllow: /\n`).join("\n")}\nSitemap: ${SITE}/sitemap.xml\n`);
write("404.html",`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>الصفحة غير موجودة | ${NAME}</title><link rel="stylesheet" href="/site.css"></head><body><main class="wrap"><h1>الصفحة غير موجودة</h1><p><a href="/">العودة إلى الرئيسية</a></p></main></body></html>`);

console.log("built",movies.length,"movies,",act.length,"categories");
