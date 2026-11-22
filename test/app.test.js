import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

const { app, pool } = require('../app');

describe('POST /todos', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 201 with the created todo', async () => {
    const row = { id: 1, title: 'a', description: null, completed: false };
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [row] });
    const res = await request(app).post('/todos').send({ title: 'a' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(row);
    expect(spy.mock.calls[0][1]).toEqual(['a', null]);
  });

  it('returns 400 VALIDATION_ERROR for missing title', async () => {
    const spy = vi.spyOn(pool, 'query');
    const res = await request(app).post('/todos').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('title is required');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 400 for oversized title', async () => {
    const res = await request(app).post('/todos').send({ title: 'x'.repeat(256) });
    expect(res.status).toBe(400);
  });

  it('returns 500 INTERNAL_ERROR on database failure', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/todos').send({ title: 'a' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Database error' },
    });
  });
});

describe('GET /todos', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 200 with an array of todos ordered by created_at DESC', async () => {
    const rows = [
      { id: 2, title: 'b', created_at: '2024-01-02T00:00:00.000Z' },
      { id: 1, title: 'a', created_at: '2024-01-01T00:00:00.000Z' },
    ];
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows });
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(spy.mock.calls[0][0]).toMatch(/ORDER BY created_at DESC/);
  });

  it('returns 200 with an empty array when there are no todos', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] });
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 INTERNAL_ERROR on database failure', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/todos');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Database error' },
    });
  });
});

describe('GET /todos/:id', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 200 with the todo when it exists', async () => {
    const row = { id: 5, title: 'a', description: null, completed: false };
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [row] });
    const res = await request(app).get('/todos/5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(row);
    expect(spy.mock.calls[0][1]).toEqual([5]);
  });

  it('returns 404 NOT_FOUND when the todo does not exist', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] });
    const res = await request(app).get('/todos/42');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Todo with id 42 not found' },
    });
  });

  it.each(['abc', '0', '-1', '1abc', '1.5'])(
    'returns 400 VALIDATION_ERROR for invalid id %s',
    async (id) => {
      const spy = vi.spyOn(pool, 'query');
      const res = await request(app).get(`/todos/${id}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' },
      });
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it('returns 500 INTERNAL_ERROR on database failure', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/todos/1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Database error' },
    });
  });
});

describe('PUT /todos/:id', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 200 with the updated todo using a parameterized COALESCE update', async () => {
    const row = { id: 3, title: 'new', description: null, completed: true };
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [row] });
    const res = await request(app).put('/todos/3').send({ title: 'new', completed: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(row);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/COALESCE/);
    expect(spy.mock.calls[0][0]).toMatch(/updated_at = NOW\(\)/);
    expect(spy.mock.calls[0][0]).toMatch(/RETURNING/);
    expect(spy.mock.calls[0][1]).toEqual(['new', undefined, true, 3]);
  });

  it('returns 404 NOT_FOUND when the todo does not exist', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] });
    const res = await request(app).put('/todos/42').send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Todo with id 42 not found' },
    });
  });

  it('returns 400 VALIDATION_ERROR when no updatable fields are provided', async () => {
    const spy = vi.spyOn(pool, 'query');
    const res = await request(app).put('/todos/1').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for invalid field values', async () => {
    const spy = vi.spyOn(pool, 'query');
    const res = await request(app).put('/todos/1').send({ completed: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1', '1.5'])('returns 400 for invalid id %s', async (id) => {
    const spy = vi.spyOn(pool, 'query');
    const res = await request(app).put(`/todos/${id}`).send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR on database failure', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
    const res = await request(app).put('/todos/1').send({ title: 'x' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Database error' },
    });
  });
});

describe('DELETE /todos/:id', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 204 with no body when the todo is deleted', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rowCount: 1 });
    const res = await request(app).delete('/todos/7');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(spy.mock.calls[0][1]).toEqual([7]);
  });

  it('returns 404 NOT_FOUND when the todo does not exist', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rowCount: 0 });
    const res = await request(app).delete('/todos/42');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Todo with id 42 not found' },
    });
  });

  it.each(['abc', '0', '-1', '1.5'])('returns 400 for invalid id %s', async (id) => {
    const spy = vi.spyOn(pool, 'query');
    const res = await request(app).delete(`/todos/${id}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR on database failure', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
    const res = await request(app).delete('/todos/1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Database error' },
    });
  });
});

describe('app', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });

  it('parses JSON bodies via express.json()', async () => {
    app.post('/__echo', (req, res) => res.json(req.body));
    const res = await request(app).post('/__echo').send({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: 1 });
  });
});
