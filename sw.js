const C="tm-v3";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=="GET"||u.origin!==location.origin||/^\/panel(?:$|[./-])/i.test(u.pathname)||/^\/admin(?:$|[./-])/i.test(u.pathname))return;
 const key=u.pathname.toLowerCase().endsWith(".json")?new Request(u.origin+u.pathname):r;
 e.respondWith(fetch(r).then(async res=>{
  if(res.ok){try{const c=await caches.open(C);await c.put(key,res.clone())}catch{}}
  return res;
 }).catch(async()=>{
  try{const c=await caches.open(C);const hit=await c.match(key);if(hit)return hit}catch{}
  return r.mode==="navigate"?(await caches.match("/"))||Response.error():Response.error();
 }));
});
