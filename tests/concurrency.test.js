// @vitest-environment node
// Controlled promises verify bounded overlap and failure scheduling, without timers.
import { describe, it, expect } from 'vitest';
import { pMap } from '../services/concurrency.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('pMap scheduling contract', () => {
  it('overlaps independent work within the limit and preserves input order', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const secondStarted = deferred();
    const thirdStarted = deferred();
    const started = [];
    let active = 0;
    let peak = 0;
    const result = pMap([0, 1, 2], async index => {
      started.push(index);
      peak = Math.max(peak, ++active);
      if (index === 1) secondStarted.resolve();
      if (index === 2) thirdStarted.resolve();
      try { return await gates[index].promise; } finally { active -= 1; }
    }, 2);
    await secondStarted.promise;
    expect(started).toEqual([0, 1]);
    gates[1].resolve('second');
    await thirdStarted.promise;
    expect(active).toBe(2);
    gates[2].resolve('third');
    gates[0].resolve('first');
    expect(await result).toEqual(['first', 'second', 'third']);
    expect(peak).toBe(2);
  });

  it('stops scheduling after a rejection while already started work can finish', async () => {
    const failed = deferred();
    const pending = deferred();
    const bothStarted = deferred();
    const started = [];
    let finished = false;
    const failure = new Error('upload failed');
    const result = pMap([0, 1, 2, 3], async index => {
      started.push(index);
      if (index === 1) bothStarted.resolve();
      if (index === 0) return failed.promise;
      await pending.promise;
      finished = true;
      return index;
    }, 2);
    const rejected = expect(result).rejects.toBe(failure);
    await bothStarted.promise;
    failed.reject(failure);
    await rejected;
    expect(started).toEqual([0, 1]);
    expect(finished).toBe(false);
    pending.resolve();
    await pending.promise;
    expect(finished).toBe(true);
    expect(started).toEqual([0, 1]);
  });
});
