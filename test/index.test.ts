import { test } from 'node:test';
import assert from 'node:assert';
import { resolveQuery } from '../src/index.js';

test('resolveQuery - valid ranges match correctly', () => {
  const ip1 = resolveQuery('1.vm.test');
  assert.strictEqual(ip1, '192.168.100.1');

  const ip254 = resolveQuery('254.vm.test');
  assert.strictEqual(ip254, '192.168.100.254');
});

test('resolveQuery - out of bounds returns null', () => {
  const ip0 = resolveQuery('0.vm.test');
  assert.strictEqual(ip0, null);

  const ip255 = resolveQuery('255.vm.test');
  assert.strictEqual(ip255, null);
});

test('resolveQuery - non-matching domains return null', () => {
  const noMatch = resolveQuery('google.com');
  assert.strictEqual(noMatch, null);
});

test('resolveQuery - invalid formats return null', () => {
  const badMatch = resolveQuery('abc.vm.test');
  assert.strictEqual(badMatch, null);
});
