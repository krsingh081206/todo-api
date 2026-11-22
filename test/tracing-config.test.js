// Unit tests for tracing configuration parsing from environment variables
// (Requirements 3.1, 3.2). The OTel modules are replaced in require.cache with
// fakes so no real SDK starts and no network connection is made.
const path = require('path');
const { createRequire } = require('module');

const root = path.join(__dirname, '..');
const tracingPath = path.join(root, 'tracing.js');
const rootRequire = createRequire(tracingPath);

const MODULES = [
  '@opentelemetry/sdk-node',
  '@opentelemetry/exporter-trace-otlp-grpc',
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/resources',
  '@opentelemetry/sdk-trace-base',
];

const ENV_KEYS = ['NODE_ENV', 'OTEL_EXPORTER_OTLP_ENDPOINT'];

let saved;
let savedCache;
let calls;

function fake(id, exports) {
  const resolved = rootRequire.resolve(id);
  savedCache[resolved] = require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports, children: [], paths: [] };
}

function loadTracing() {
  delete require.cache[tracingPath];
  const mod = require(tracingPath);
  return mod;
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  savedCache = {};
  calls = { sdk: [], exporter: [], resource: [], autoInst: [], processor: [], start: 0 };

  fake('@opentelemetry/sdk-node', {
    NodeSDK: class {
      constructor(cfg) { calls.sdk.push(cfg); }
      start() { calls.start += 1; }
      shutdown() { return Promise.resolve(); }
    },
  });
  fake('@opentelemetry/exporter-trace-otlp-grpc', {
    OTLPTraceExporter: class { constructor(cfg) { calls.exporter.push(cfg); } },
  });
  fake('@opentelemetry/auto-instrumentations-node', {
    getNodeAutoInstrumentations: (cfg) => { calls.autoInst.push(cfg); return ['auto']; },
  });
  fake('@opentelemetry/resources', {
    Resource: class { constructor(attrs) { this.attributes = attrs; calls.resource.push(attrs); } },
  });
  fake('@opentelemetry/sdk-trace-base', {
    BatchSpanProcessor: class { constructor(exp, opts) { this.exporter = exp; this.opts = opts; calls.processor.push(this); } },
  });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  for (const [resolved, orig] of Object.entries(savedCache)) {
    if (orig) require.cache[resolved] = orig;
    else delete require.cache[resolved];
  }
  delete require.cache[tracingPath];
  process.removeAllListeners('SIGTERM');
});

describe('tracing config from environment', () => {
  it('uses default OTLP endpoint http://localhost:4317 when env var is unset', () => {
    loadTracing();
    expect(calls.exporter).toEqual([{ url: 'http://localhost:4317' }]);
  });

  it('uses OTEL_EXPORTER_OTLP_ENDPOINT when set', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4317';
    loadTracing();
    expect(calls.exporter).toEqual([{ url: 'http://collector:4317' }]);
  });

  it('falls back to default endpoint when env var is empty', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = '';
    loadTracing();
    expect(calls.exporter[0].url).toBe('http://localhost:4317');
  });

  it('sets deployment.environment from NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    loadTracing();
    expect(calls.resource[0]['deployment.environment']).toBe('production');
  });

  it('defaults deployment.environment to development', () => {
    loadTracing();
    expect(calls.resource[0]['deployment.environment']).toBe('development');
  });

  it('sets service.name todo-api and service.version 1.0.0', () => {
    loadTracing();
    expect(calls.resource[0]['service.name']).toBe('todo-api');
    expect(calls.resource[0]['service.version']).toBe('1.0.0');
  });

  it('disables fs instrumentation in auto-instrumentations', () => {
    loadTracing();
    expect(calls.autoInst[0]).toEqual({ '@opentelemetry/instrumentation-fs': { enabled: false } });
  });

  it('wires exporter into a BatchSpanProcessor and starts the SDK once', () => {
    loadTracing();
    expect(calls.processor).toHaveLength(1);
    expect(calls.processor[0].exporter).toBeDefined();
    expect(calls.sdk[0].spanProcessors).toEqual(calls.processor);
    expect(calls.start).toBe(1);
  });

  it('returns undefined instead of throwing when SDK construction fails', () => {
    fake('@opentelemetry/sdk-node', {
      NodeSDK: class { constructor() { throw new Error('boom'); } },
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = loadTracing();
    expect(mod.initializeTracing()).toBeUndefined();
    errSpy.mockRestore();
  });
});
