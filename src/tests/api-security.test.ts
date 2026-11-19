/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests API complémentaires : santé, en-têtes de sécurité, identité, validation, rate limiting.
 */

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import { resetDbForTests } from '../server/db.ts';

describe('API — santé, sécurité et validation', () => {
  const app = createApiApp();

  beforeEach(() => {
    resetDbForTests();
  });

  it('expose /api/health sans authentification et avec les en-têtes de sécurité', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('refuse un acteur inconnu avec un 401', async () => {
    const res = await request(app).get('/api/contacts').set('x-actor-id', 'usr-inexistant');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED_ACTOR');
  });

  it('rejette un contact invalide avec un 400 détaillé', async () => {
    const res = await request(app).post('/api/contacts').send({});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('applique le rate limiting sur les exports quand il est activé', async () => {
    const previous = process.env.RATE_LIMIT_EXPORT_MAX;
    process.env.RATE_LIMIT_EXPORT_MAX = '1';
    try {
      const actor = 'usr-admin';
      const send = () =>
        request(app).get('/api/export').set('x-actor-id', actor).set('x-enforce-ratelimit', 'true');
      await send();
      const limited = await send();
      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe('RATE_LIMIT_EXCEEDED');
    } finally {
      if (previous === undefined) delete process.env.RATE_LIMIT_EXPORT_MAX;
      else process.env.RATE_LIMIT_EXPORT_MAX = previous;
    }
  });
});
