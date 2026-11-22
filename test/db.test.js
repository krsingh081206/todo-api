// test/db.test.js - Unit tests for db.js module
const { Pool } = require('pg');
const {
  createPool,
  getConfigFromEnv,
  pool: defaultPool,
  runMigrations,
  DatabaseMigrationError,
} = require('../db');
const { migrationSql } = require('../migrations/001_create_todos_table');

/**
 * Creates a mock pool with a controllable query method.
 * @param {Array<Error|{rows: *[]}>} results - Queue of results/errors per call
 * @returns {{ query: import('vitest').Mock, calls: string[] }}
 */
function createMockPool(results) {
  const calls = [];
  let callIndex = 0;
  const query = vi.fn(async (sql) => {
    calls.push(sql);
    const result = results[callIndex++];
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  return { query, calls };
}

// Track created pools so we can clean them up
const createdPools = [];

afterAll(async () => {
  // Close all pools created during tests
  await Promise.all(createdPools.map((p) => p.end()));
  // Close the default pool imported from db.js
  await defaultPool.end();
});

describe('db.js', () => {
  describe('createPool()', () => {
    it('should return a pg.Pool instance', () => {
      const testPool = createPool({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        maxConnections: 5,
      });
      createdPools.push(testPool);
      expect(testPool).toBeInstanceOf(Pool);
    });

    it('should default max connections to 10 when maxConnections is not provided', () => {
      const testPool = createPool({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      });
      createdPools.push(testPool);
      expect(testPool.options.max).toBe(10);
    });

    it('should default max connections to 10 when maxConnections is 0', () => {
      const testPool = createPool({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        maxConnections: 0,
      });
      createdPools.push(testPool);
      expect(testPool.options.max).toBe(10);
    });

    it('should use the provided maxConnections value', () => {
      const testPool = createPool({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        maxConnections: 20,
      });
      createdPools.push(testPool);
      expect(testPool.options.max).toBe(20);
    });

    it('should configure host, port, database, user, and password from config', () => {
      const testPool = createPool({
        host: 'db.example.com',
        port: 5433,
        database: 'mydb',
        user: 'myuser',
        password: 'mypass',
        maxConnections: 10,
      });
      createdPools.push(testPool);
      expect(testPool.options.host).toBe('db.example.com');
      expect(testPool.options.port).toBe(5433);
      expect(testPool.options.database).toBe('mydb');
      expect(testPool.options.user).toBe('myuser');
      expect(testPool.options.password).toBe('mypass');
    });

    it('should use custom config values that override environment variable defaults', () => {
      // Set env vars to known values
      process.env.DB_HOST = 'envhost';
      process.env.DB_PORT = '9999';
      process.env.DB_NAME = 'envdb';
      process.env.DB_USER = 'envuser';
      process.env.DB_PASSWORD = 'envpass';

      // Create pool with custom config - should NOT use env vars
      const testPool = createPool({
        host: 'customhost',
        port: 7777,
        database: 'customdb',
        user: 'customuser',
        password: 'custompass',
        maxConnections: 15,
      });
      createdPools.push(testPool);
      expect(testPool.options.host).toBe('customhost');
      expect(testPool.options.port).toBe(7777);
      expect(testPool.options.database).toBe('customdb');
      expect(testPool.options.user).toBe('customuser');
      expect(testPool.options.password).toBe('custompass');
      expect(testPool.options.max).toBe(15);
    });
  });

  describe('getConfigFromEnv()', () => {
    it('should read configuration from environment variables', () => {
      process.env.DB_HOST = 'testhost';
      process.env.DB_PORT = '1234';
      process.env.DB_NAME = 'testdb';
      process.env.DB_USER = 'testuser';
      process.env.DB_PASSWORD = 'testpass';

      const config = getConfigFromEnv();

      expect(config.host).toBe('testhost');
      expect(config.port).toBe(1234);
      expect(config.database).toBe('testdb');
      expect(config.user).toBe('testuser');
      expect(config.password).toBe('testpass');
      expect(config.maxConnections).toBe(10);
    });

    it('should provide sensible defaults when env vars are not set', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;

      const config = getConfigFromEnv();

      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.database).toBe('todos');
      expect(config.user).toBe('postgres');
      expect(config.password).toBe('postgres');
      expect(config.maxConnections).toBe(10);
    });

    it('should parse port as an integer', () => {
      process.env.DB_PORT = '6543';
      const config = getConfigFromEnv();
      expect(config.port).toBe(6543);
      expect(typeof config.port).toBe('number');
    });
  });

  describe('default pool (exported as pool)', () => {
    it('should be a pg.Pool instance', () => {
      expect(defaultPool).toBeInstanceOf(Pool);
    });

    it('should have max connections set to 10', () => {
      expect(defaultPool.options.max).toBe(10);
    });
  });

  describe('DatabaseMigrationError', () => {
    it('should be an instance of Error', () => {
      const err = new DatabaseMigrationError('test message');
      expect(err).toBeInstanceOf(Error);
    });

    it('should have name set to DatabaseMigrationError', () => {
      const err = new DatabaseMigrationError('test message');
      expect(err.name).toBe('DatabaseMigrationError');
    });

    it('should have the provided message', () => {
      const err = new DatabaseMigrationError('migration failed');
      expect(err.message).toBe('migration failed');
    });

    it('should store the underlying cause when provided', () => {
      const cause = new Error('connection refused');
      const err = new DatabaseMigrationError('migration failed', cause);
      expect(err.cause).toBe(cause);
    });

    it('should not have cause when not provided', () => {
      const err = new DatabaseMigrationError('test message');
      expect(err.cause).toBeUndefined();
    });
  });

  describe('runMigrations()', () => {
    it('should execute all migration statements in order', async () => {
      const successResults = migrationSql.map(() => ({ rows: [] }));
      const mockPool = createMockPool(successResults);

      await runMigrations(mockPool);

      expect(mockPool.query).toHaveBeenCalledTimes(migrationSql.length);
      expect(mockPool.calls).toEqual(migrationSql);
    });

    it('should execute statements in the order defined in migrationSql', async () => {
      const successResults = migrationSql.map(() => ({ rows: [] }));
      const mockPool = createMockPool(successResults);

      await runMigrations(mockPool);

      // Verify order matches the migrationSql array
      for (let i = 0; i < migrationSql.length; i++) {
        expect(mockPool.calls[i]).toBe(migrationSql[i]);
      }
    });

    it('should throw DatabaseMigrationError when a statement fails', async () => {
      const dbError = new Error('syntax error');
      const results = [dbError, ...migrationSql.slice(1).map(() => ({ rows: [] }))];
      const mockPool = createMockPool(results);

      await expect(runMigrations(mockPool)).rejects.toThrow(DatabaseMigrationError);
    });

    it('should include the statement index and underlying error message in the thrown error', async () => {
      const dbError = new Error('relation already exists');
      const results = [dbError, ...migrationSql.slice(1).map(() => ({ rows: [] }))];
      const mockPool = createMockPool(results);

      try {
        await runMigrations(mockPool);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseMigrationError);
        expect(err.message).toContain('statement 1');
        expect(err.message).toContain('relation already exists');
        expect(err.cause).toBe(dbError);
      }
    });

    it('should stop at the first failing statement and not execute remaining statements', async () => {
      const dbError = new Error('connection refused');
      const results = [dbError, ...migrationSql.slice(1).map(() => ({ rows: [] }))];
      const mockPool = createMockPool(results);

      await expect(runMigrations(mockPool)).rejects.toThrow(DatabaseMigrationError);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should complete successfully when all statements succeed', async () => {
      const successResults = migrationSql.map(() => ({ rows: [] }));
      const mockPool = createMockPool(successResults);

      await expect(runMigrations(mockPool)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledTimes(migrationSql.length);
    });
  });
});
