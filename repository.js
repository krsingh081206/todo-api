// repository.js - TodoRepository module with parameterized SQL queries
// All database operations use parameterized inputs ($1, $2, etc.) to prevent SQL injection.

/**
 * @typedef {Object} Todo
 * @property {number} id
 * @property {string} title
 * @property {string|null} description
 * @property {boolean} completed
 * @property {string} created_at  - ISO 8601 timestamp
 * @property {string} updated_at  - ISO 8601 timestamp
 */

/**
 * @typedef {Object} CreateTodoInput
 * @property {string} title
 * @property {string|null} [description]  - optional
 */

/**
 * @typedef {Object} UpdateTodoInput
 * @property {string} [title]              - optional
 * @property {string|null} [description]   - optional
 * @property {boolean} [completed]         - optional
 */

/**
 * @typedef {Object} TodoRepository
 * @property {function(CreateTodoInput): Promise<Todo>} create
 * @property {function(): Promise<Todo[]>} findAll
 * @property {function(number): Promise<Todo|null>} findById
 * @property {function(number, UpdateTodoInput): Promise<Todo|null>} update
 * @property {function(number): Promise<boolean>} delete
 */

/**
 * Creates a TodoRepository bound to the given connection pool.
 * All methods use parameterized queries — no string concatenation.
 * @param {import('pg').Pool} pool - The PostgreSQL connection pool
 * @returns {TodoRepository}
 */
function createTodoRepository(pool) {
  /**
   * Creates a new todo.
   * @param {CreateTodoInput} input - { title, description? }
   * @returns {Promise<Todo>} The created todo
   */
  async function create({ title, description = null }) {
    const result = await pool.query(
      'INSERT INTO todos (title, description) VALUES ($1, $2) RETURNING *',
      [title, description]
    );
    return result.rows[0];
  }

  /**
   * Returns all todos ordered by created_at descending.
   * @returns {Promise<Todo[]>} Array of todos (empty if none)
   */
  async function findAll() {
    const result = await pool.query(
      'SELECT * FROM todos ORDER BY created_at DESC'
    );
    return result.rows;
  }

  /**
   * Finds a todo by ID.
   * @param {number} id - The todo ID
   * @returns {Promise<Todo|null>} The todo, or null if not found
   */
  async function findById(id) {
    const result = await pool.query(
      'SELECT * FROM todos WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Updates a todo by ID using COALESCE for partial updates.
   * The update is atomic (single UPDATE statement with RETURNING clause).
   * Only provided (non-undefined) fields are updated; undefined fields
   * retain their existing values via COALESCE.
   * @param {number} id - The todo ID
   * @param {UpdateTodoInput} input - Fields to update
   * @returns {Promise<Todo|null>} The updated todo, or null if not found
   */
  async function update(id, { title, description, completed } = {}) {
    const result = await pool.query(
      `UPDATE todos SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         completed = COALESCE($3, completed),
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [title, description, completed, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Deletes a todo by ID.
   * @param {number} id - The todo ID
   * @returns {Promise<boolean>} true if deleted, false if not found
   */
  async function deleteTodo(id) {
    const result = await pool.query(
      'DELETE FROM todos WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  return {
    create,
    findAll,
    findById,
    update,
    delete: deleteTodo,
  };
}

module.exports = { createTodoRepository };
