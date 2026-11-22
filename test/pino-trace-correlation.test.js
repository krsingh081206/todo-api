// Verifies @opentelemetry/instrumentation-pino injects trace context into Pino
// log entries only while a span is active (Requirements 1.1, 4.2).
//
// Runs in a child process so the instrumentation is registered before pino is
// first required (require-in-the-middle patches modules at load time).
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

const script = `
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { PinoInstrumentation } = require('@opentelemetry/instrumentation-pino');
const { trace, context } = require('@opentelemetry/api');

const provider = new NodeTracerProvider();
provider.register();
registerInstrumentations({ instrumentations: [new PinoInstrumentation()] });

// Required after instrumentation registration; uses the app's real logger config.
const logger = require('./logger');

logger.info('outside-span');
const span = trace.getTracer('test').startSpan('work');
context.with(trace.setSpan(context.active(), span), () => logger.info('inside-span'));
span.end();
const sc = span.spanContext();
console.error('SPAN:' + JSON.stringify({ traceId: sc.traceId, spanId: sc.spanId }));
`;

function run() {
  const res = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'info' },
  });
  if (res.status !== 0) throw new Error(res.stderr);
  const logs = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
  const spanLine = res.stderr.split('\n').find((l) => l.startsWith('SPAN:'));
  return { logs, span: JSON.parse(spanLine.slice(5)) };
}

describe('pino trace correlation', () => {
  it('injects trace_id, span_id, trace_flags inside a span and nothing outside', () => {
    const { logs, span } = run();
    const outside = logs.find((l) => l.msg === 'outside-span');
    const inside = logs.find((l) => l.msg === 'inside-span');

    expect(outside).toBeDefined();
    expect(outside).not.toHaveProperty('trace_id');
    expect(outside).not.toHaveProperty('span_id');
    expect(outside).not.toHaveProperty('trace_flags');

    expect(inside.trace_id).toBe(span.traceId);
    expect(inside.span_id).toBe(span.spanId);
    expect(inside).toHaveProperty('trace_flags');
  }, 30000);
});
