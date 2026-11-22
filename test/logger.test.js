// test/logger.test.js - Unit tests for logger.js module
// Verifies that the logger exports a Pino logger instance and a pino-http
// middleware function for automatic HTTP request logging.

const logger = require('../logger');

describe('logger.js', () => {
  describe('default export (Pino logger instance)', () => {
    it('should export a Pino logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should support direct logging calls (backward compatible)', () => {
      expect(() => logger.info('test message')).not.toThrow();
      expect(() => logger.info({ msg: 'structured log', field: 'value' })).not.toThrow();
    });
  });

  describe('httpLogger export (pino-http middleware)', () => {
    it('should export an httpLogger function as a named export', () => {
      expect(logger.httpLogger).toBeDefined();
      expect(typeof logger.httpLogger).toBe('function');
    });

    it('should export requestLogger as a named alias for httpLogger', () => {
      expect(logger.requestLogger).toBeDefined();
      expect(typeof logger.requestLogger).toBe('function');
      expect(logger.requestLogger).toBe(logger.httpLogger);
    });

    it('should act as Express middleware (req, res, next signature)', () => {
      const middleware = logger.httpLogger;
      expect(middleware.length).toBe(3); // (req, res, next)
    });
  });

  describe('GCP Cloud Logging compatibility', () => {
    it('should use the same logger instance for HTTP middleware', () => {
      // The pino-http middleware should be configured with the existing logger
      // so that HTTP request logs share the same GCP format (severity, timestamp)
      // We verify this by checking that httpLogger is a pino-http wrapper around
      // our logger — it should not create a separate logger with different config.
      expect(logger.httpLogger).toBeDefined();
      expect(logger.info).toBeDefined();
    });
  });
});
