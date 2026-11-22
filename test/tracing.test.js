// Verifies tracing.js is wired to load before application code (Requirement 3.1)
const { execFileSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

const root = path.join(__dirname, '..');

describe('tracing preload', () => {
  it('start script preloads tracing.js via --require', () => {
    expect(pkg.scripts.start).toBe('node --require ./tracing.js ./app.js');
  });

  it('registers the OTel tracer provider before express/pg/pino are loaded', () => {
    const code = [
      "const c = () => Object.keys(require.cache);",
      "const loaded = (n) => c().some((k) => k.includes('/node_modules/' + n + '/'));",
      "const before = { express: loaded('express'), pg: loaded('pg'), pino: loaded('pino') };",
      "const { trace } = require('@opentelemetry/api');",
      "const p = trace.getTracerProvider();",
      "const delegate = p.getDelegate ? p.getDelegate().constructor.name : p.constructor.name;",
      "console.log(JSON.stringify({ before, delegate }));",
      "process.exit(0);",
    ].join('\n');
    const out = execFileSync(
      process.execPath,
      ['--require', './tracing.js', '-e', code],
      { cwd: root, encoding: 'utf8', env: { ...process.env, OTEL_SDK_DISABLED: '' } }
    );
    const result = JSON.parse(out.trim().split('\n').pop());
    expect(result.before).toEqual({ express: false, pg: false, pino: false });
    expect(result.delegate).not.toBe('NoopTracerProvider');
  }, 30000);
});
