const test = require('node:test');
const assert = require('node:assert/strict');
const { createAsyncAction } = require('../../dist/interior');

function manualTimers() {
  const pending = new Map();
  let next = 1;
  return {
    setTimer(fn) { const id = next++; pending.set(id, fn); return id; },
    clearTimer(id) { pending.delete(id); },
    flush() { const fns = [...pending.values()]; pending.clear(); fns.forEach((fn) => fn()); },
    get size() { return pending.size; },
  };
}

test('runs idle → pending → success → idle', async () => {
  const timers = manualTimers();
  const seen = [];
  const action = createAsyncAction({ action: async () => {}, onStatus: (s) => seen.push(s), ...timers });

  assert.equal(await action.run(), 'success');
  timers.flush();

  assert.deepEqual(seen, ['pending', 'success', 'idle']);
  assert.equal(action.status, 'idle');
});

test('a failing action ends in error, then idle', async () => {
  const timers = manualTimers();
  const seen = [];
  const action = createAsyncAction({ action: async () => { throw new Error('nope'); }, onStatus: (s) => seen.push(s), ...timers });

  assert.equal(await action.run(), 'error');
  timers.flush();

  assert.deepEqual(seen, ['pending', 'error', 'idle']);
});

test('an action that returns false counts as an error', async () => {
  const timers = manualTimers();
  const action = createAsyncAction({ action: async () => false, onStatus: () => {}, ...timers });

  assert.equal(await action.run(), 'error');
});

test('clicks while pending are ignored, so the action runs once', async () => {
  const timers = manualTimers();
  let calls = 0;
  let release;
  const action = createAsyncAction({ action: () => { calls += 1; return new Promise((r) => { release = r; }); }, onStatus: () => {}, ...timers });

  const first = action.run();
  assert.equal(await action.run(), 'ignored');
  release();

  assert.equal(await first, 'success');
  assert.equal(calls, 1);
});

test('a newer run cancels the older run’s reset to idle', async () => {
  const timers = manualTimers();
  const seen = [];
  const action = createAsyncAction({ action: async () => {}, onStatus: (s) => seen.push(s), ...timers });

  await action.run();
  await action.run();

  assert.equal(timers.size, 1);
  timers.flush();
  assert.deepEqual(seen, ['pending', 'success', 'pending', 'success', 'idle']);
});

test('an action that returns null (cancelled) goes straight back to idle', async () => {
  const timers = manualTimers();
  const seen = [];
  const action = createAsyncAction({ action: async () => null, onStatus: (s) => seen.push(s), ...timers });

  assert.equal(await action.run(), 'idle');
  assert.deepEqual(seen, ['pending', 'idle']);
  assert.equal(timers.size, 0);
});
