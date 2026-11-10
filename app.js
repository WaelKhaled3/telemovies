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
})();
