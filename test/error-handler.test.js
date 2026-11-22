import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

const express = require('express');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { app, pool, errorHandler, isDatabaseError } = require('../app');

function makeSpan() {
  return {
    recordException: vi.fn(),
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
  };
}

function appThrowing(err) {
  const a = express();
  a.get('/boom', (req, res, next) => next(err));
  a.use(errorHandler);
  return a;
}

describe('error handling middleware', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 500 "Database error" for pg errors and records the exception', async () => {
    const span = makeSpan();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(span);
    const err = Object.assign(new Error('relation missing'), {
      code: '42P01',
      severity: 'ERROR',
    });

    const res = await request(appThrowing(err)).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Database error' },
    });
    expect(span.recordException).toHaveBeenCalledWith(err);
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'relation missing',
    });
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 500);
  });

  it('treats ECONNREFUSED as a database error', async () => {
    const err = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Database error');
  });

  it('returns "Internal server error" for non-database errors', async () => {
    const res = await request(appThrowing(new Error('oops'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('does not fail when there is no active span', async () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    const res = await request(appThrowing(new Error('oops'))).get('/boom');
    expect(res.status).toBe(500);
  });

  it('delegates to next(err) when headers were already sent', () => {
    const err = new Error('late');
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    const next = vi.fn();
    errorHandler(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON bodies on the real app', async () => {
    const res = await request(app)
      .post('/todos')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('isDatabaseError classifies errors', () => {
    expect(isDatabaseError(null)).toBe(false);
    expect(isDatabaseError(new Error('x'))).toBe(false);
    expect(isDatabaseError({ severity: 'FATAL' })).toBe(true);
    expect(isDatabaseError({ code: '23505' })).toBe(true);
  });

  it('keeps pool referenced so app module loads without a DB', () => {
    expect(pool).toBeDefined();
  });
});
