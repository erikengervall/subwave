// GET /state's `streamIdleWindow` (#2072): the latest idle pause as ages, from
// which the web player sizes its skip over a woken station's stale silence.
// Every stamp is taken when the mixer acknowledged the command, and anything
// the monitor cannot vouch for errs toward a smaller skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamIdleMonitor } from '../src/broadcast/stream-idle.js';

function fixture(opts: { status?: Promise<boolean>; failOn?: boolean } = {}) {
  let now = 50_000;
  let count: number | null = 0;
  let enabled = true;
  let failOn = opts.failOn ?? false;
  const monitor = createStreamIdleMonitor({
    clock: () => now,
    idleStatus: () => opts.status ?? Promise.resolve(false),
    idleOn: async () => {
      // The command takes a moment: the stamp is when the mixer answered.
      now += 30;
      if (failOn) throw new Error('telnet unavailable');
    },
    idleOff: async () => { now += 30; },
    refresh: async () => {},
    gatedListenerCount: () => count,
    streamSettings: () => ({ idleWhenEmpty: enabled, idleAfterMinutes: 1 }),
    setStreamIdle: () => {}, warmHeavy: async () => {}, log: () => {},
  });
  return {
    monitor,
    advance: (ms: number) => { now += ms; },
    listeners: (n: number | null) => { count = n; },
    enable: (on: boolean) => { enabled = on; },
    failOn: (fail: boolean) => { failOn = fail; },
  };
}

// The pause needs the empty room for a full minute of wall clock, which
// nextIdleState reads from Date.now(), so drive it with a minute already past.
async function pauseNow(f: ReturnType<typeof fixture>) {
  f.listeners(0);
  await f.monitor.tick(); // starts the empty-room clock
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try {
    await f.monitor.tick();
  } finally {
    Date.now = realNow;
  }
}

test('null before the first pause since boot', async () => {
  const f = fixture();
  await f.monitor.initialize();
  assert.equal(f.monitor.idleWindow(), null);
  f.listeners(3);
  await f.monitor.tick();
  assert.equal(f.monitor.idleWindow(), null);
});

test('a pause is aged from the mixer acknowledging it, and its resume likewise', async () => {
  const f = fixture();
  await f.monitor.initialize();
  await pauseNow(f);
  assert.equal(f.monitor.isIdle(), true);
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 0, endedMsAgo: null });

  f.advance(600_000);
  f.listeners(1);
  await f.monitor.tick();
  assert.equal(f.monitor.isIdle(), false);
  // Paused 600s plus the resume command's own 30ms.
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 600_030, endedMsAgo: 0 });

  f.advance(12_000);
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 612_030, endedMsAgo: 12_000 });
  // A re-assert or a live tick moves nothing.
  await f.monitor.tick();
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 612_030, endedMsAgo: 12_000 });
});

test('a new pause replaces the last window', async () => {
  const f = fixture();
  await f.monitor.initialize();
  await pauseNow(f);
  f.advance(5_000);
  f.listeners(1);
  await f.monitor.tick();
  f.advance(90_000);
  await pauseNow(f);
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 0, endedMsAgo: null });
  // Still paused: the re-assert does not restart the age.
  f.advance(7_000);
  await f.monitor.tick();
  assert.equal(f.monitor.isIdle(), true);
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 7_030, endedMsAgo: null });
});

test('a pause the mixer refused records nothing', async () => {
  const f = fixture({ failOn: true });
  await f.monitor.initialize();
  await pauseNow(f);
  assert.equal(f.monitor.isIdle(), false);
  assert.equal(f.monitor.idleWindow(), null);
});

test('disabling idle mid-pause ends the window like a listener would', async () => {
  const f = fixture();
  await f.monitor.initialize();
  await pauseNow(f);
  f.advance(40_000);
  f.enable(false);
  await f.monitor.tick();
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 40_030, endedMsAgo: 0 });
});

test('an adopted pause counts from boot, never earlier', async () => {
  const f = fixture({ status: Promise.resolve(true) });
  await f.monitor.initialize();
  assert.equal(f.monitor.isIdle(), true);
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 0, endedMsAgo: null });
  f.advance(4_000);
  f.listeners(1);
  await f.monitor.tick();
  assert.deepEqual(f.monitor.idleWindow(), { startedMsAgo: 4_030, endedMsAgo: 0 });
});

test('a startup release records nothing: the mixer may never have been paused', async () => {
  const f = fixture({ status: new Promise<boolean>(() => {}) });
  await f.monitor.initialize(1);
  f.listeners(1);
  await f.monitor.tick();
  assert.equal(f.monitor.isIdle(), false);
  assert.equal(f.monitor.idleWindow(), null);
});
