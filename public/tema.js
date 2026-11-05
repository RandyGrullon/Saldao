// El tema elegido en Cuenta, antes de pintar: sin parpadeo. Oscuro si no se eligió nada (src/lib/theme.ts).
// Va en un archivo aparte y no dentro de index.html para que la política de seguridad (CSP) no tenga que permitir scripts en línea.
(function () {
  try {
    var m = localStorage.getItem('saldao:tema');
    if (m === 'light' || m === 'auto') document.documentElement.setAttribute('data-theme', m);
    if (m === 'light' || (m === 'auto' && matchMedia('(prefers-color-scheme: light)').matches))
      document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f6f5f0');
  } catch (e) {}
})();
