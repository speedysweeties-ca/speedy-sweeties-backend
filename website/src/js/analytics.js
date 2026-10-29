(() => {
  const productionHosts = ["www.speedysweeties.ca", "speedysweeties.ca"];
  if (window.speedySite?.live !== true || !productionHosts.includes(window.location.hostname)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", "G-VHCS5BSCW5");
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=G-VHCS5BSCW5";
  document.head.appendChild(tag);
})();
