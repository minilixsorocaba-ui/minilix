const CACHE='minilix-client-v2';

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(['/cliente','/manifest.webmanifest','/minilix-icon.svg']))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const url=new URL(event.request.url);

  // Nunca cachear a API: sessão/login do cliente precisa sempre consultar o servidor.
  if(url.pathname.startsWith('/api/')){
    event.respondWith(
      fetch(event.request).catch(()=>caches.match(event.request))
    );
    return;
  }

  // Para a interface, prefira a rede e use o cache como fallback.
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});