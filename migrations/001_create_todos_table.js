// migrations/001_create_todos_table.js
// Migration script: creates the todos table and idx_todos_completed index.
// Uses IF NOT EXISTS for idempotency — safe to run on every application startup.

/**
 * SQL statement to create the todos table.
 * Columns:
 *   - id: SERIAL PRIMARY KEY (auto-incrementing integer)
 *   - title: VARCHAR(255) NOT NULL (required, max 255 chars)
 *   - description: TEXT (optional, nullable)
 *   - completed: BOOLEAN NOT NULL DEFAULT FALSE
 *   - created_at: TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   - updated_at: TIMESTAMPTZ NOT NULL DEFAULT NOW()
 */
const CREATE_TODOS_TABLE = `
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * SQL statement to create an index on the completed column.
 * Useful for filtering todos by completion status.
 */
const CREATE_IDX_TODOS_COMPLETED = `
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
`;

/**
 * Ordered list of migration SQL statements to execute.
 * The table must be created before the index.
 * @type {string[]}
 */
const migrationSql = [
  CREATE_TODOS_TABLE,
  CREATE_IDX_TODOS_COMPLETED,
];

module.exports = {
  CREATE_TODOS_TABLE,
  CREATE_IDX_TODOS_COMPLETED,
  migrationSql,
};
