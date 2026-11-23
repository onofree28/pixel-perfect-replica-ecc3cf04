(() => {
  let previous = '';
  const detect = () => {
    if (location.href === previous) return;
    previous = location.href;
    if (/\/projects\/[a-f0-9-]{36}/i.test(location.pathname)) chrome.runtime.sendMessage({ type: 'PROJECT', name: document.title.replace(/\s*[-|]\s*Lovable.*$/i, '') }).catch(() => {});
  };
  detect();
  window.addEventListener('popstate', detect);
  setInterval(detect, 3000);
})();