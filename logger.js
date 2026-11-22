// logger.js - Pino logger configured for GCP Cloud Logging compatibility
//
// This module creates a Pino logger instance with GCP Cloud Logging-compatible
// field names:
//   - level  → mapped to "severity" (string: "INFO", "WARNING", "ERROR", etc.)
//   - time   → mapped to "timestamp" (ISO 8601 string, not epoch ms)
//
// Trace context injection (trace_id, span_id, trace_flags) is handled
// automatically by @opentelemetry/instrumentation-pino auto-instrumentation
// when a span is active — no manual code needed here.
//
// In production (NODE_ENV=production), raw JSON is written to stdout for
// GKE/Cloud Logging compatibility. In development, pino-pretty is used for
// human-readable output.
//
// Exports:
//   - logger (default): Pino logger instance for direct use (logger.info(...))
//   - logger.httpLogger: pino-http Express middleware for automatic HTTP
//     request/response logging
//   - requestLogger: Named export — same middleware as logger.httpLogger

const pino = require('pino');
const pinoHttp = require('pino-http');

/**
 * Custom timestamp function that emits an ISO 8601 string under the
 * `timestamp` field name (instead of Pino's default `time` field), as
 * required by GCP Cloud Logging structured log format.
 *
 * @returns {string} A JSON fragment: ,"timestamp":"<ISO 8601 string>"
 */
function isoTimestamp() {
  return `,"timestamp":"${new Date(Date.now()).toISOString()}"`;
}

/**
 * Pino logger configured for GCP Cloud Logging compatibility.
 *
 * Configuration:
 * - `level`: read from LOG_LEVEL env var (default: "info")
 * - `timestamp`: ISO 8601 string via custom isoTimestamp function (uses
 *   pino.stdTimeFunctions.isoTime logic but names the field "timestamp"
 *   instead of "time" for GCP Cloud Logging compatibility)
 * - `formatters.level`: maps the numeric level label to an uppercase string
 *   `severity` field (e.g. "INFO", "WARNING", "ERROR") instead of Pino's
 *   default numeric level, as required by GCP Cloud Logging.
 * - `transport`: pino-pretty target enabled only when NODE_ENV is not
 *   "production" for developer-friendly output; disabled in production so
 *   raw JSON goes to stdout for Cloud Logging.
 *
 * @type {import('pino').Logger}
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: isoTimestamp,
  formatters: {
    level(label) {
      return { severity: label.toUpperCase() };
    },
  },
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
  }),
});

/**
 * pino-http middleware for automatic HTTP request/response logging.
 *
 * Uses the existing GCP Cloud Logging-compatible logger instance so that
 * all HTTP request logs share the same configuration (severity field,
 * ISO 8601 timestamp, trace context injection via OTel auto-instrumentation).
 *
 * Usage in Express:
 *   const logger = require('./logger');
 *   app.use(logger.httpLogger);
 *   // or:
 *   const { requestLogger } = require('./logger');
 *   app.use(requestLogger);
 *
 * The middleware attaches a per-request child logger to `req.log` and
 * automatically logs:
 *   - Incoming request (method, URL, remote address)
 *   - Outgoing response (status code, response time)
 *
 * @type {import('pino-http').HttpLogger}
 */
const httpLogger = pinoHttp({ logger });

// Default export: the Pino logger instance (backward compatible)
module.exports = logger;

// Named exports for the pino-http middleware
module.exports.httpLogger = httpLogger;
module.exports.requestLogger = httpLogger;
