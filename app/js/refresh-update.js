// Checks for pending or newly published service worker updates during pull-to-refresh.
// Returns true if a new update was found and is ready to activate, or false if already up to date.

export async function checkForUpdate({ timeoutMs = 2000 } = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;

    // 1. A new service worker is already downloaded and waiting to take over
    if (reg.waiting) {
      try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
      return true;
    }

    let updateFound = false;
    let installed = false;
    const onUpdateFound = () => {
      updateFound = true;
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' || newWorker.state === 'activated') {
          installed = true;
        }
      });
    };
    if (typeof reg.addEventListener === 'function') {
      reg.addEventListener('updatefound', onUpdateFound, { once: true });
    }

    let controllerChanged = false;
    const onControllerChange = () => { controllerChanged = true; };
    if (typeof navigator.serviceWorker.addEventListener === 'function') {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
    }

    // Check with the network for a newer sw.js
    try { await reg.update(); } catch (e) {}

    if (reg.waiting) {
      try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
      return true;
    }
    if (controllerChanged || installed) return true;

    // If an update was found or is installing, wait up to timeoutMs for it to settle
    if (updateFound || reg.installing) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (reg.waiting) {
          try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
          return true;
        }
        if (controllerChanged || installed || reg.installing?.state === 'installed') {
          return true;
        }
        await new Promise(r => setTimeout(r, 60));
      }
    }
    return false;
  } catch (err) {
    return false;
  }
}
