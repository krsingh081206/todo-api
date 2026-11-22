import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

const { trace } = require('@opentelemetry/api');
const { app, pool } = require('../app');

// Validates: Requirements 1.3, 1.4, 3.3
// Each route handler must set http.status_code on the active span.
function mockSpan() {
  const span = {
    setAttribute: vi.fn(),
    recordException: vi.fn(),
    setStatus: vi.fn(),
  };
  vi.spyOn(trace, 'getActiveSpan').mockReturnValue(span);
  return span;
}

const row = { id: 1, title: 'a', description: null, completed: false };

describe('http.status_code on active span per route', () => {
  afterEach(() => vi.restoreAllMocks());

  const cases = [
    ['POST /todos 201', 'post', '/todos', { title: 'a' }, { rows: [row] }, 201],
    ['POST /todos 400', 'post', '/todos', {}, null, 400],
    ['GET /todos 200', 'get', '/todos', null, { rows: [row] }, 200],
    ['GET /todos/:id 200', 'get', '/todos/1', null, { rows: [row] }, 200],
    ['GET /todos/:id 404', 'get', '/todos/1', null, { rows: [] }, 404],
    ['GET /todos/:id 400', 'get', '/todos/abc', null, null, 400],
    ['PUT /todos/:id 200', 'put', '/todos/1', { title: 'b' }, { rows: [row] }, 200],
    ['PUT /todos/:id 404', 'put', '/todos/1', { title: 'b' }, { rows: [] }, 404],
    ['PUT /todos/:id 400', 'put', '/todos/1', {}, null, 400],
    ['DELETE /todos/:id 204', 'delete', '/todos/1', null, { rowCount: 1, rows: [row] }, 204],
    ['DELETE /todos/:id 404', 'delete', '/todos/1', null, { rowCount: 0, rows: [] }, 404],
    ['DELETE /todos/:id 400', 'delete', '/todos/0', null, null, 400],
  ];

  it.each(cases)('%s', async (_name, method, url, body, dbResult, status) => {
    const span = mockSpan();
    if (dbResult) vi.spyOn(pool, 'query').mockResolvedValue(dbResult);
    let req = request(app)[method](url);
    if (body) req = req.send(body);
    const res = await req;
    expect(res.status).toBe(status);
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', status);
  });

  it.each([
    ['post', '/todos', { title: 'a' }],
    ['get', '/todos', null],
    ['get', '/todos/1', null],
    ['put', '/todos/1', { title: 'b' }],
    ['delete', '/todos/1', null],
  ])('%s %s sets 500 and records exception on DB failure', async (method, url, body) => {
    const span = mockSpan();
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
    let req = request(app)[method](url);
    if (body) req = req.send(body);
    const res = await req;
    expect(res.status).toBe(500);
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 500);
    expect(span.recordException).toHaveBeenCalled();
  });

  it('error middleware sets 400 for malformed JSON', async () => {
    const span = mockSpan();
    const res = await request(app)
      .post('/todos')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 400);
  });

  it('does not throw when there is no active span', async () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [row] });
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
  });
});
