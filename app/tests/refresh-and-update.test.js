import test from 'node:test';
import assert from 'node:assert/strict';

test('refresh: checkForUpdate detects waiting service worker and triggers update', async () => {
  const { checkForUpdate } = await import('../js/refresh-update.js');

  let skipWaitingCalled = false;
  const mockReg = {
    waiting: {
      postMessage: msg => {
        if (msg?.type === 'SKIP_WAITING' || msg?.type === 'skip-waiting') skipWaitingCalled = true;
      }
    },
    update: async () => {}
  };

  const mockSW = {
    getRegistration: async () => mockReg,
    addEventListener: () => {}
  };

  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: mockSW,
    configurable: true,
    writable: true
  });

  const isUpdated = await checkForUpdate();
  assert.equal(isUpdated, true, 'Should detect waiting worker as an update');
  assert.equal(skipWaitingCalled, true, 'Should post SKIP_WAITING to waiting worker');
});

test('refresh: checkForUpdate returns false when no update is found', async () => {
  const { checkForUpdate } = await import('../js/refresh-update.js');

  const mockReg = {
    waiting: null,
    installing: null,
    update: async () => {},
    addEventListener: () => {}
  };

  const mockSW = {
    getRegistration: async () => mockReg,
    addEventListener: () => {}
  };

  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: mockSW,
    configurable: true,
    writable: true
  });

  const isUpdated = await checkForUpdate();
  assert.equal(isUpdated, false, 'Should return false when no update is waiting or installing');
});
