/* Ambient Pinball v0.9.5 - PWA shell r2. */
'use strict';
const CACHE_PREFIX='ambient-pinball-pwa-';
const CACHE_NAME=CACHE_PREFIX+'0.9.5-r2';
const STATIC_FILES=[
  './', './index.html', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];
const scopeURL=new URL(self.registration.scope);
self.addEventListener('install', event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_FILES.map(file=>new URL(file,scopeURL).href));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(scopeURL.pathname))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try{
        const response=await fetch(request);
        if(response.ok)await cache.put(new URL('./index.html',scopeURL),response.clone());
        return response;
      }catch(_){
        return await cache.match(new URL('./index.html',scopeURL))||Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(request,{ignoreSearch:true});
    return cached||fetch(request);
  })());
});
