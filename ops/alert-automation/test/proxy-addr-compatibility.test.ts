import { createRequire } from 'node:module';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const expressRequire = createRequire(require.resolve('express/package.json'));
const proxyAddr = expressRequire('proxy-addr');

describe('patched Express proxy address trust', () => {
  it('does not trust arbitrary IPv4 clients through short IPv6 subnet prefixes', () => {
    expect(expressRequire('proxy-addr/package.json').version).toBe('2.0.8');
    for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
      const trust = proxyAddr.compile(subnet);
      expect(trust('203.0.113.10')).toBe(false);
      expect(proxyAddr({
        socket: { remoteAddress: '203.0.113.10' },
        headers: { 'x-forwarded-for': '198.51.100.99' },
      }, trust)).toBe('203.0.113.10');
    }
  });

  it('preserves correctly configured IPv4 and mapped IPv6 trust ranges', () => {
    for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
      const trust = proxyAddr.compile(subnet);
      expect(trust('10.1.2.3')).toBe(true);
      expect(trust('203.0.113.10')).toBe(false);
      expect(proxyAddr({
        socket: { remoteAddress: '10.1.2.3' },
        headers: { 'x-forwarded-for': '198.51.100.99' },
      }, trust)).toBe('198.51.100.99');
    }
  });

  it('Express rejects spoofed forwarding with a short prefix and honors explicit loopback trust', async () => {
    const createApp = (trust: string) => {
      const app = express();
      app.set('trust proxy', trust);
      app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips }));
      return app;
    };
    const rejected = await request(createApp('::ffff:10.0.0.0/8'))
      .get('/').set('X-Forwarded-For', '198.51.100.99').expect(200);
    expect(rejected.body.ip).not.toBe('198.51.100.99');
    expect(rejected.body.ips).toEqual([]);
    const accepted = await request(createApp('loopback'))
      .get('/').set('X-Forwarded-For', '198.51.100.99').expect(200);
    expect(accepted.body.ip).toBe('198.51.100.99');
    expect(accepted.body.ips).toEqual(['198.51.100.99']);
  });
});
