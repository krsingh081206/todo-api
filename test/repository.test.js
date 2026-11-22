// test/repository.test.js - Unit tests for repository.js module
const { createTodoRepository } = require('../repository');

/**
 * Creates a mock pool with a controllable query method.
 * Captures both SQL and params for verification.
 * @param {Array<Error|{rows: *[], rowCount?: number}>} results - Queue of results/errors per call
 * @returns {{ query: import('vitest').Mock, calls: Array<{sql: string, params: *[]}> }}
 */
function createMockPool(results) {
  const calls = [];
  let callIndex = 0;
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params: params || [] });
    const result = results[callIndex++];
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  return { query, calls };
}

// Sample todo data for tests
const sampleTodo = {
  id: 1,
  title: 'Buy groceries',
  description: 'Milk, eggs, bread',
  completed: false,
  created_at: '2024-01-15T12:00:00.000Z',
  updated_at: '2024-01-15T12:00:00.000Z',
};

describe('repository.js', () => {
  describe('createTodoRepository()', () => {
    it('should return an object with create, findAll, findById, update, delete methods', () => {
      const repo = createTodoRepository({ query: vi.fn() });
      expect(typeof repo.create).toBe('function');
      expect(typeof repo.findAll).toBe('function');
      expect(typeof repo.findById).toBe('function');
      expect(typeof repo.update).toBe('function');
      expect(typeof repo.delete).toBe('function');
    });
  });

  describe('create()', () => {
    it('should execute INSERT with parameterized query and RETURNING *', async () => {
      const mockPool = createMockPool([{ rows: [sampleTodo] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.create({ title: 'Buy groceries', description: 'Milk, eggs, bread' });

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.calls[0].sql).toBe(
        'INSERT INTO todos (title, description) VALUES ($1, $2) RETURNING *'
      );
      expect(mockPool.calls[0].params).toEqual(['Buy groceries', 'Milk, eggs, bread']);
      expect(result).toEqual(sampleTodo);
    });

    it('should pass null for description when not provided', async () => {
      const mockPool = createMockPool([{ rows: [sampleTodo] }]);
      const repo = createTodoRepository(mockPool);

      await repo.create({ title: 'Buy groceries' });

      expect(mockPool.calls[0].params).toEqual(['Buy groceries', null]);
    });

    it('should pass null explicitly when description is null', async () => {
      const mockPool = createMockPool([{ rows: [sampleTodo] }]);
      const repo = createTodoRepository(mockPool);

      await repo.create({ title: 'Buy groceries', description: null });

      expect(mockPool.calls[0].params).toEqual(['Buy groceries', null]);
    });

    it('should use parameterized inputs ($1, $2) — no string concatenation', async () => {
      const mockPool = createMockPool([{ rows: [sampleTodo] }]);
      const repo = createTodoRepository(mockPool);

      await repo.create({ title: "'; DROP TABLE todos; --", description: 'malicious' });

      // Verify the malicious string is passed as a parameter, not interpolated
      expect(mockPool.calls[0].params[0]).toBe("'; DROP TABLE todos; --");
      expect(mockPool.calls[0].sql).not.toContain("'; DROP TABLE todos; --");
    });
  });

  describe('findAll()', () => {
    it('should execute SELECT with ORDER BY created_at DESC', async () => {
      const todos = [sampleTodo, { ...sampleTodo, id: 2, title: 'Second todo' }];
      const mockPool = createMockPool([{ rows: todos }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.findAll();

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.calls[0].sql).toBe('SELECT * FROM todos ORDER BY created_at DESC');
      expect(mockPool.calls[0].params).toEqual([]);
      expect(result).toEqual(todos);
    });

    it('should return empty array when no todos exist', async () => {
      const mockPool = createMockPool([{ rows: [] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById()', () => {
    it('should execute SELECT with parameterized WHERE id = $1', async () => {
      const mockPool = createMockPool([{ rows: [sampleTodo] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.findById(1);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.calls[0].sql).toBe('SELECT * FROM todos WHERE id = $1');
      expect(mockPool.calls[0].params).toEqual([1]);
      expect(result).toEqual(sampleTodo);
    });

    it('should return null when todo is not found', async () => {
      const mockPool = createMockPool([{ rows: [] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });

    it('should use parameterized input — no string concatenation', async () => {
      const mockPool = createMockPool([{ rows: [] }]);
      const repo = createTodoRepository(mockPool);

      await repo.findById("1; DROP TABLE todos");

      expect(mockPool.calls[0].params[0]).toBe("1; DROP TABLE todos");
      expect(mockPool.calls[0].sql).not.toContain("DROP TABLE");
    });
  });

  describe('update()', () => {
    it('should execute UPDATE with COALESCE and RETURNING * for all fields', async () => {
      const updatedTodo = { ...sampleTodo, title: 'Updated', completed: true };
      const mockPool = createMockPool([{ rows: [updatedTodo] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.update(1, { title: 'Updated', description: 'New desc', completed: true });

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.calls[0].sql).toContain('UPDATE todos SET');
      expect(mockPool.calls[0].sql).toContain('COALESCE($1, title)');
      expect(mockPool.calls[0].sql).toContain('COALESCE($2, description)');
      expect(mockPool.calls[0].sql).toContain('COALESCE($3, completed)');
      expect(mockPool.calls[0].sql).toContain('updated_at = NOW()');
      expect(mockPool.calls[0].sql).toContain('WHERE id = $4 RETURNING *');
      expect(mockPool.calls[0].params).toEqual(['Updated', 'New desc', true, 1]);
      expect(result).toEqual(updatedTodo);
    });

    it('should pass undefined for omitted fields (COALESCE retains existing values)', async () => {
      const updatedTodo = { ...sampleTodo, completed: true };
      const mockPool = createMockPool([{ rows: [updatedTodo] }]);
      const repo = createTodoRepository(mockPool);

      await repo.update(1, { completed: true });

      // title and description are undefined → COALESCE keeps existing values
      expect(mockPool.calls[0].params).toEqual([undefined, undefined, true, 1]);
    });

    it('should update only title when only title is provided', async () => {
      const updatedTodo = { ...sampleTodo, title: 'New Title' };
      const mockPool = createMockPool([{ rows: [updatedTodo] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.update(1, { title: 'New Title' });

      expect(mockPool.calls[0].params).toEqual(['New Title', undefined, undefined, 1]);
      expect(result).toEqual(updatedTodo);
    });

    it('should return null when todo is not found', async () => {
      const mockPool = createMockPool([{ rows: [] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.update(999, { title: 'Updated' });

      expect(result).toBeNull();
    });

    it('should use parameterized inputs — no string concatenation', async () => {
      const updatedTodo = { ...sampleTodo };
      const mockPool = createMockPool([{ rows: [updatedTodo] }]);
      const repo = createTodoRepository(mockPool);

      await repo.update(1, { title: "'; DROP TABLE todos; --" });

      expect(mockPool.calls[0].params[0]).toBe("'; DROP TABLE todos; --");
      expect(mockPool.calls[0].sql).not.toContain("DROP TABLE");
    });

    it('should handle empty update input object', async () => {
      const mockPool = createMockPool([{ rows: [sampleTodo] }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.update(1, {});

      // All fields undefined → COALESCE retains all existing values
      expect(mockPool.calls[0].params).toEqual([undefined, undefined, undefined, 1]);
      expect(result).toEqual(sampleTodo);
    });
  });

  describe('delete()', () => {
    it('should execute DELETE with parameterized WHERE id = $1', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 1 }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.delete(1);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.calls[0].sql).toBe('DELETE FROM todos WHERE id = $1');
      expect(mockPool.calls[0].params).toEqual([1]);
      expect(result).toBe(true);
    });

    it('should return false when todo is not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      const repo = createTodoRepository(mockPool);

      const result = await repo.delete(999);

      expect(result).toBe(false);
    });

    it('should use parameterized input — no string concatenation', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      const repo = createTodoRepository(mockPool);

      await repo.delete("1; DROP TABLE todos");

      expect(mockPool.calls[0].params[0]).toBe("1; DROP TABLE todos");
      expect(mockPool.calls[0].sql).not.toContain("DROP TABLE");
    });
  });

  describe('parameterized query verification (Requirement 5.1)', () => {
    it('all SQL queries should use $1, $2 parameter placeholders — no interpolated values', async () => {
      const mockPool = createMockPool([
        { rows: [sampleTodo] },          // create
        { rows: [sampleTodo] },          // findAll
        { rows: [sampleTodo] },          // findById
        { rows: [sampleTodo] },          // update
        { rows: [], rowCount: 1 },       // delete
      ]);
      const repo = createTodoRepository(mockPool);

      await repo.create({ title: 'Test Title', description: 'Test Desc' });
      await repo.findAll();
      await repo.findById(42);
      await repo.update(42, { title: 'Updated', completed: false });
      await repo.delete(42);

      // Verify no SQL query contains literal values from the input
      for (const call of mockPool.calls) {
        expect(call.sql).not.toContain('Test Title');
        expect(call.sql).not.toContain('Test Desc');
        expect(call.sql).not.toContain('Updated');
        expect(call.sql).not.toContain("'42'");
      }

      // Verify queries use parameter placeholders
      expect(mockPool.calls[0].sql).toContain('$1');
      expect(mockPool.calls[0].sql).toContain('$2');
      expect(mockPool.calls[2].sql).toContain('$1');
      expect(mockPool.calls[3].sql).toContain('$4'); // update uses $4 for id
      expect(mockPool.calls[4].sql).toContain('$1');
    });
  });
});
