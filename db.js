// db.js - PostgreSQL connection pool and query helpers
const { Pool } = require('pg');
const { migrationSql } = require('./migrations/001_create_todos_table');

/**
 * Custom error thrown when database migrations fail.
 * @extends Error
 */
class DatabaseMigrationError extends Error {
  /**
   * @param {string} message - Descriptive error message
   * @param {Error} [cause] - The underlying database error
   */
  constructor(message, cause) {
    super(message);
    this.name = 'DatabaseMigrationError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} host
 * @property {number} port
 * @property {string} database
 * @property {string} user
 * @property {string} password
 * @property {number} maxConnections  - pool size
 */

/**
 * Reads database configuration from environment variables.
 * @returns {DatabaseConfig}
 */
function getConfigFromEnv() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'todos',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    maxConnections: 10,
  };
}

/**
 * Creates a PostgreSQL connection pool.
 * @param {DatabaseConfig} config - Database connection configuration
 * @returns {import('pg').Pool}
 */
function createPool(config) {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.maxConnections || 10,
  });
}

/**
 * Runs database migrations by executing each SQL statement in order.
 * Throws DatabaseMigrationError if any statement fails.
 * @param {import('pg').Pool} pool - The PostgreSQL connection pool
 * @returns {Promise<void>}
 * @throws {DatabaseMigrationError} When a migration statement fails
 */
async function runMigrations(pool) {
  for (let i = 0; i < migrationSql.length; i++) {
    const statement = migrationSql[i];
    try {
      await pool.query(statement);
    } catch (err) {
      throw new DatabaseMigrationError(
        `Migration failed at statement ${i + 1} of ${migrationSql.length}: ${err.message}`,
        err
      );
    }
  }
}

// Create default pool from environment variables
const pool = createPool(getConfigFromEnv());

module.exports = {
  createPool,
  getConfigFromEnv,
  pool,
  runMigrations,
  DatabaseMigrationError,
};
