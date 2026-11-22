// app.js - Express application entry point
// Start with tracing: node --require ./tracing.js ./app.js
const express = require('express');
const logger = require('./logger');
const { requestLogger } = require('./logger');
const { pool, runMigrations } = require('./db');
const { createTodoRepository } = require('./repository');
const { validateCreateTodoInput, validateUpdateTodoInput } = require('./validation');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

const app = express();

app.use(express.json());
app.use(requestLogger);

const todoRepository = createTodoRepository(pool);

// --- Routes (tasks 6.2-6.6) are registered here ---

// POST /todos - create a todo
app.post('/todos', async (req, res) => {
  const span = trace.getActiveSpan();
  const setStatus = (code) => {
    if (span) span.setAttribute('http.status_code', code);
  };

  const result = validateCreateTodoInput(req.body);
  if (!result.valid) {
    setStatus(400);
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: result.errors.join(', ') },
    });
  }

  // Custom span, child of the active Express route span. The DB insert runs in
  // its context so the pg instrumentation span becomes its child.
  const createSpan = trace.getTracer('todo-api').startSpan('todo.create');
  createSpan.setAttribute('todo.title', result.data.title);
  try {
    const todo = await context.with(
      trace.setSpan(context.active(), createSpan),
      () => todoRepository.create(result.data)
    );
    createSpan.setAttribute('todo.id', todo.id);
    setStatus(201);
    return res.status(201).json(todo);
  } catch (err) {
    createSpan.recordException(err);
    createSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    logger.error({ msg: 'Failed to create todo', error: err.message, err });
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    setStatus(500);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Database error' } });
  } finally {
    createSpan.end();
  }
});

// GET /todos - list todos ordered by created_at DESC
app.get('/todos', async (req, res) => {
  const span = trace.getActiveSpan();
  const setStatus = (code) => {
    if (span) span.setAttribute('http.status_code', code);
  };

  try {
    const todos = await todoRepository.findAll();
    setStatus(200);
    return res.status(200).json(todos);
  } catch (err) {
    logger.error({ msg: 'Failed to list todos', error: err.message, err });
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    setStatus(500);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Database error' } });
  }
});

// GET /todos/:id - fetch a single todo
app.get('/todos/:id', async (req, res) => {
  const span = trace.getActiveSpan();
  const setStatus = (code) => {
    if (span) span.setAttribute('http.status_code', code);
  };

  const rawId = req.params.id;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    setStatus(400);
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' },
    });
  }

  try {
    const todo = await todoRepository.findById(id);
    if (!todo) {
      setStatus(404);
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Todo with id ${id} not found` },
      });
    }
    setStatus(200);
    return res.status(200).json(todo);
  } catch (err) {
    logger.error({ msg: 'Failed to get todo', error: err.message, err });
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    setStatus(500);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Database error' } });
  }
});

// PUT /todos/:id - partial update (single atomic UPDATE ... RETURNING with COALESCE).
// Limitation: because of COALESCE, an explicit `description: null` leaves the
// existing description unchanged (null is indistinguishable from "not provided").
app.put('/todos/:id', async (req, res) => {
  const span = trace.getActiveSpan();
  const setStatus = (code) => {
    if (span) span.setAttribute('http.status_code', code);
  };

  const rawId = req.params.id;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    setStatus(400);
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' },
    });
  }

  const result = validateUpdateTodoInput(req.body);
  if (!result.valid) {
    setStatus(400);
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: result.errors.join(', ') },
    });
  }

  try {
    const todo = await todoRepository.update(id, result.data);
    if (!todo) {
      setStatus(404);
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Todo with id ${id} not found` },
      });
    }
    setStatus(200);
    return res.status(200).json(todo);
  } catch (err) {
    logger.error({ msg: 'Failed to update todo', error: err.message, err });
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    setStatus(500);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Database error' } });
  }
});

// DELETE /todos/:id - delete a todo
app.delete('/todos/:id', async (req, res) => {
  const span = trace.getActiveSpan();
  const setStatus = (code) => {
    if (span) span.setAttribute('http.status_code', code);
  };

  const rawId = req.params.id;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    setStatus(400);
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' },
    });
  }

  try {
    const deleted = await todoRepository.delete(id);
    if (!deleted) {
      setStatus(404);
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Todo with id ${id} not found` },
      });
    }
    setStatus(204);
    return res.status(204).send();
  } catch (err) {
    logger.error({ msg: 'Failed to delete todo', error: err.message, err });
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    setStatus(500);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Database error' } });
  }
});

// --- Error handling middleware (task 6.7), registered after routes ---

const DB_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
]);

/**
 * True for pg errors (DatabaseError carries a string SQLSTATE `code` and a
 * `severity`) and for network-level connection errors.
 */
function isDatabaseError(err) {
  if (!err) return false;
  if (typeof err.severity === 'string') return true;
  if (typeof err.code === 'string') {
    return DB_ERROR_CODES.has(err.code) || /^[0-9A-Z]{5}$/.test(err.code);
  }
  return false;
}

// Express error handler: records the exception on the active span, logs via
// Pino (trace_id is injected by instrumentation-pino) and returns a 500.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Malformed JSON bodies are client errors, not server errors.
  if (err && err.type === 'entity.parse.failed') {
    const parseSpan = trace.getActiveSpan();
    if (parseSpan) parseSpan.setAttribute('http.status_code', 400);
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
    });
  }

  const message = isDatabaseError(err) ? 'Database error' : 'Internal server error';
  const error = err instanceof Error ? err : new Error(String(err));

  logger.error({ msg: message, error: error.message, err: error });

  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.setAttribute('http.status_code', 500);
  }

  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
}

app.use(errorHandler);

let server = null;

/**
 * Runs migrations, then starts the HTTP server.
 * Migrations complete before the server begins listening.
 * @param {number} [port] - Defaults to PORT env var, then 8080
 * @returns {Promise<import('http').Server>}
 */
async function start(port = parseInt(process.env.PORT || '8080', 10)) {
  await runMigrations(pool);
  await new Promise((resolve, reject) => {
    server = app.listen(port, resolve);
    server.once('error', reject);
  });
  logger.info({ msg: 'Todo API started', port });
  return server;
}

/**
 * Gracefully stops the HTTP server (if running) and closes the DB pool.
 * @returns {Promise<void>}
 */
async function stop() {
  if (server) {
    const s = server;
    server = null;
    await new Promise((resolve, reject) =>
      s.close((err) => (err ? reject(err) : resolve()))
    );
  }
  await pool.end();
}

if (require.main === module) {
  start().catch((err) => {
    logger.error({ msg: 'Failed to start Todo API', error: err.message });
    process.exit(1);
  });
}

module.exports = { app, pool, start, stop, errorHandler, isDatabaseError };
