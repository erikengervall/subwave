// The mechanism behind the web player's skip over a woken station's stale idle
// silence (#2072): it reads /state only after the first audio, leaves a live
// station's playback untouched, sheds lag by playbackRate and reports what it
// measured, and an engine that ignores the rate (WebKit's GStreamer build) gets
// today's behaviour. A fake element runs on the real clock, so each test takes
// a fraction of a second at a small buffer.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKIP_CUSHION_SECONDS } from './idleSkip';
import { SKIP_RATE, skipIdleSilence } from './idleSkipPlayback';
import type { IdleWindow } from './types';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const IDLE: IdleWindow = { startedMsAgo: 10 * 60_000, endedMsAgo: null };

// A media element whose clock runs at playbackRate, unless the engine ignores it.
class FakeAudio extends EventTarget {
  readyState = 0;
  paused = true;
  honoursRate = true;
  rates: number[] = [];
  private base = 0;
  private since = performance.now();
  private rate = 1;
  get currentTime() {
    if (this.paused) return this.base;
    return this.base + ((performance.now() - this.since) / 1000) * (this.honoursRate ? this.rate : 1);
  }
  get playbackRate() { return this.rate; }
  set playbackRate(r: number) {
    this.base = this.currentTime;
    this.since = performance.now();
    this.rate = r;
    this.rates.push(r);
  }
  start() {
    this.readyState = 4;
    this.paused = false;
    this.since = performance.now();
    this.dispatchEvent(new Event('loadedmetadata'));
    this.dispatchEvent(new Event('playing'));
  }
}

function run(opts: { buffer?: number; window?: IdleWindow | null; read?: () => Promise<unknown> } = {}) {
  const el = new FakeAudio();
  const log: string[] = [];
  const trims: number[] = [];
  const cancel = skipIdleSilence(el as unknown as HTMLAudioElement, {
    bufferSeconds: opts.buffer ?? SKIP_CUSHION_SECONDS + 2.5,
    readState: async () => {
      log.push(`read@${el.readyState}`);
      if (opts.read) return opts.read() as never;
      return { streamIdleWindow: opts.window === undefined ? IDLE : opts.window };
    },
    onTrim: ms => trims.push(ms),
  });
  return { el, log, trims, cancel };
}

test('a live station is read after the first audio and its playback left alone', async () => {
  for (const window of [null, { startedMsAgo: 900_000, endedMsAgo: 300_000 }]) {
    const r = run({ window });
    await sleep(20);
    assert.deepEqual(r.log, [], 'nothing is read before the first audio');
    r.el.start();
    await sleep(200);
    assert.deepEqual(r.log, ['read@4']);
    assert.deepEqual(r.el.rates, [], 'the rate is never touched');
    assert.deepEqual(r.trims, []);
    r.cancel();
    assert.deepEqual(r.el.rates, []);
  }
});

test('an idle tune-in sheds down to the cushion and reports what it measured', async () => {
  const r = run();
  r.el.start();
  await sleep(900);
  assert.deepEqual(r.el.rates, [SKIP_RATE, 1]);
  assert.equal(r.trims.length, 1);
  // 2.5s to shed; overshoot is bounded by the check interval.
  const trim = r.trims[0] ?? 0;
  assert.ok(trim >= 2_500 && trim < 2_900, String(trim));
});

test('an engine that ignores the rate is put back to 1x and reports nothing', async () => {
  const r = run();
  r.el.honoursRate = false;
  r.el.start();
  await sleep(2_000);
  assert.deepEqual(r.el.rates, [SKIP_RATE, 1]);
  assert.deepEqual(r.trims, []);
});

test('running out of buffer ends the skip with what was shed', async () => {
  const r = run({ buffer: 30 });
  r.el.start();
  await sleep(150);
  r.el.dispatchEvent(new Event('waiting'));
  assert.deepEqual(r.el.rates, [SKIP_RATE, 1]);
  assert.equal(r.trims.length, 1);
  const trim = r.trims[0] ?? 0;
  assert.ok(trim > 300 && trim < 2_000, String(trim));
});

test('cancelling mid-skip restores 1x and reports nothing', async () => {
  const r = run({ buffer: 30 });
  r.el.start();
  await sleep(150);
  r.cancel();
  assert.deepEqual(r.el.rates, [SKIP_RATE, 1]);
  await sleep(300);
  assert.deepEqual(r.trims, []);
  assert.deepEqual(r.el.rates, [SKIP_RATE, 1]);
});

test('a failed read, or one cancelled in flight, skips nothing', async () => {
  const failed = run({ read: () => Promise.reject(new Error('offline')) });
  failed.el.start();
  await sleep(100);
  assert.deepEqual(failed.el.rates, []);

  let answer!: (v: unknown) => void;
  const pending = run({ read: () => new Promise(r => { answer = r; }) });
  pending.el.start();
  await sleep(20);
  pending.cancel();
  answer({ streamIdleWindow: IDLE });
  await sleep(100);
  assert.deepEqual(pending.el.rates, []);
  assert.deepEqual(pending.trims, []);
});
