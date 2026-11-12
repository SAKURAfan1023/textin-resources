(() => {
  if (window.__textinAnalyticsInstalled || window.zhuge) return;
  window.__textinAnalyticsInstalled = true;

  // Use the overseas main site's project and SDK; keep Resources identifiable.
  const queue = window.zhuge = [];
  for (const method of ['_init', 'identify', 'track', 'trackRevenue', 'getDid', 'getSid', 'getKey', 'setSuperProperty', 'setUserProperties', 'setWxProperties', 'setPlatform', 'trackClick']) {
    queue[method] = (...args) => { queue.push([method, ...args]); return queue; };
  }
  queue._init('ea505ff234c6450caf517b3344821768', {
    superProperty: { appName: 'Textin_web_source_next_ai', site: 'resources' },
    autoTrack: true,
    singlePage: true,
    visualizer: true,
    cookie_cross_subdomain: true
  });

  // Capture before list navigation stops propagation. The SDK's hook marker
  // makes its body listener skip this same click, so only one default event fires.
  window.zgclickhook = true;
  window.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest('a[href], button, input[type="button"], input[type="submit"], input[type="reset"]')
      : null;
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    target.setAttribute('zgclickable', 'true');
    window.zhuge.trackClick(event);
  }, true);

  const script = document.createElement('script');
  script.id = 'zhuge-js';
  script.async = true;
  script.onerror = () => { queue.trackClick = () => {}; };
  script.src = `https://zhugeio-sdk.intsig.net/zhuge.js?v=${new Date().toISOString().slice(0, 10)}`;
  document.head.append(script);
})();
