// Service worker do Cadê a carona: mostra avisos com o app fechado.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { titulo: "Cadê a carona", texto: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "Cadê a carona", {
      body: d.texto || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: d.tag,
      data: { link: d.link || "/" },
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if ("focus" in aba) {
          aba.navigate(link);
          return aba.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
