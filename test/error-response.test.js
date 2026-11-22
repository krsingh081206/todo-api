import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

const express = require('express');
const { app, pool, errorHandler } = require('../app');

// Asserts the ErrorResponse shape: { error: { code: string, message: string } }
function expectErrorResponse(body, code, message) {
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).sort()).toEqual(['code', 'message']);
  expect(typeof body.error.code).toBe('string');
  expect(typeof body.error.message).toBe('string');
  expect(body.error.code).toBe(code);
  if (message instanceof RegExp) expect(body.error.message).toMatch(message);
  else expect(body.error.message).toBe(message);
}

function appThrowing(err) {
  const a = express();
  a.get('/boom', (req, res, next) => next(err));
  a.post('/json', express.json(), (req, res) => res.sendStatus(200));
  a.use(errorHandler);
  return a;
}

describe('ErrorResponse formatting', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('validation errors (400)', () => {
    it('POST /todos with missing title', async () => {
      const res = await request(app).post('/todos').send({});
      expect(res.status).toBe(400);
      expectErrorResponse(res.body, 'VALIDATION_ERROR', 'title is required');
    });

    it('GET /todos/:id with invalid id', async () => {
      const res = await request(app).get('/todos/abc');
      expect(res.status).toBe(400);
      expectErrorResponse(res.body, 'VALIDATION_ERROR', 'Invalid ID format');
    });

    it('PUT /todos/:id with empty update body', async () => {
      const res = await request(app).put('/todos/1').send({});
      expect(res.status).toBe(400);
      expectErrorResponse(res.body, 'VALIDATION_ERROR', /.+/);
    });

    it('DELETE /todos/:id with invalid id', async () => {
      const res = await request(app).delete('/todos/0');
      expect(res.status).toBe(400);
      expectErrorResponse(res.body, 'VALIDATION_ERROR', 'Invalid ID format');
    });

    it('malformed JSON body', async () => {
      const res = await request(appThrowing(new Error('x')))
        .post('/json')
        .set('Content-Type', 'application/json')
        .send('{bad');
      expect(res.status).toBe(400);
      expectErrorResponse(res.body, 'VALIDATION_ERROR', 'Invalid JSON body');
    });
  });

  describe('not found (404)', () => {
    it('GET /todos/:id', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] });
      const res = await request(app).get('/todos/42');
      expect(res.status).toBe(404);
      expectErrorResponse(res.body, 'NOT_FOUND', 'Todo with id 42 not found');
    });

    it('PUT /todos/:id', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] });
      const res = await request(app).put('/todos/7').send({ title: 'x' });
      expect(res.status).toBe(404);
      expectErrorResponse(res.body, 'NOT_FOUND', 'Todo with id 7 not found');
    });

    it('DELETE /todos/:id', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 });
      const res = await request(app).delete('/todos/9');
      expect(res.status).toBe(404);
      expectErrorResponse(res.body, 'NOT_FOUND', 'Todo with id 9 not found');
    });
  });

  describe('internal errors (500)', () => {
    it('route handler DB failure returns "Database error"', async () => {
      vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/todos');
      expect(res.status).toBe(500);
      expectErrorResponse(res.body, 'INTERNAL_ERROR', 'Database error');
    });

    it('error middleware: database error', async () => {
      const err = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
      const res = await request(appThrowing(err)).get('/boom');
      expect(res.status).toBe(500);
      expectErrorResponse(res.body, 'INTERNAL_ERROR', 'Database error');
    });

    it('error middleware: non-database error', async () => {
      const res = await request(appThrowing(new Error('oops'))).get('/boom');
      expect(res.status).toBe(500);
      expectErrorResponse(res.body, 'INTERNAL_ERROR', 'Internal server error');
    });

    it('does not leak the original error message', async () => {
      const res = await request(appThrowing(new Error('secret detail'))).get('/boom');
      expect(JSON.stringify(res.body)).not.toContain('secret detail');
    });
  });
});
