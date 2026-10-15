import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLanHost } from '../src/network.ts';

test('modo local por defecto y LAN solo con una dirección IPv4 privada explícita', () => {
  assert.equal(parseLanHost(undefined), undefined);
  for (const host of ['192.168.78.239', '10.0.0.1', '172.16.0.1', '172.31.255.254']) {
    assert.equal(parseLanHost(host), host);
  }
  for (const host of ['', '0.0.0.0', '127.0.0.1', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1', 'localhost', '::', '::1', 'https://192.168.1.1', '192.168.1.2:3000', '192.168.999.1', ' 192.168.1.1']) {
    assert.throws(() => parseLanHost(host), /IPv4 privada/);
  }
});
