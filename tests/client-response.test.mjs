import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, decodeResponse } from '../client/src/api/response.ts';
test('client preserves successful JSON and actionable script validation', () => {
  assert.deepEqual(decodeResponse('{"entities":[]}', 200, true), { entities: [] });
  assert.throws(
    () => decodeResponse('{"errors":[{"line":3,"message":"Invalid target."}]}', 400, false),
    (e) => e instanceof ApiError && e.status === 400 && e.message === 'Line 3: Invalid target.',
  );
});
test('HTML proxy errors and malformed successful responses never surface raw bodies or parser errors', () => {
  for (const [status, ok] of [
    [502, false],
    [200, true],
  ])
    assert.throws(
      () => decodeResponse('<html>private upstream traceback</html>', status, ok),
      (e) =>
        e instanceof ApiError &&
        e.status === 502 &&
        !e.message.includes('traceback') &&
        !e.message.includes('JSON'),
    );
  assert.throws(
    () => decodeResponse('{"error":{"private":"secret"}}', 503, false),
    (e) => e.message === 'Request failed.',
  );
});
