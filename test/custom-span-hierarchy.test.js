import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

const { trace, context } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} = require('@opentelemetry/sdk-trace-base');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

// Validates: Requirements 1.2, 1.3
// The custom "todo.create" span must be a child of the Express route span
// (same trace, parentSpanId === route span's spanId), and the pg insert must
// run beneath it.

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
let instrumentations;
let app;
let pool;
let request;

const parentIdOf = (s) => s.parentSpanContext?.spanId;
const row = { id: 7, title: 'a', description: null, completed: false };

beforeAll(() => {
  provider.register(); // also installs the async-hooks context manager
  // Enable before express is first required so it gets patched.
  // The HTTP server span supplies the root context the Express spans hang off.
  instrumentations = [new HttpInstrumentation(), new ExpressInstrumentation()];
  for (const i of instrumentations) {
    i.setTracerProvider(provider);
    i.enable();
  }
  ({ app, pool } = require('../app'));
  request = require('supertest');
});

afterAll(async () => {
  instrumentations.forEach((i) => i.disable());
  await provider.shutdown();
  trace.disable();
  context.disable();
});

afterEach(() => {
  vi.restoreAllMocks();
  exporter.reset();
});

describe('todo.create custom span hierarchy', () => {
  it('is a child of the Express route span in the same trace', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [row] });
    const res = await request(app).post('/todos').send({ title: 'a' });
    expect(res.status).toBe(201);

    const spans = exporter.getFinishedSpans();
    const custom = spans.find((s) => s.name === 'todo.create');
    expect(custom).toBeDefined();

    const parent = spans.find((s) => s.spanContext().spanId === parentIdOf(custom));
    expect(parent).toBeDefined();
    expect(parent.name).not.toBe('todo.create');
    // Parent is Express-instrumented (request handler for the /todos route).
    expect(parent.attributes['express.type']).toBe('request_handler');
    expect(parent.attributes['http.route']).toBe('/todos');
    expect(custom.spanContext().traceId).toBe(parent.spanContext().traceId);
    expect(custom.attributes['todo.title']).toBe('a');
    expect(custom.attributes['todo.id']).toBe(7);
    expect(custom.ended).toBe(true);
  });

  it('records the exception, sets ERROR status and ends the span on failure', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/todos').send({ title: 'a' });
    expect(res.status).toBe(500);

    const custom = exporter.getFinishedSpans().find((s) => s.name === 'todo.create');
    expect(custom).toBeDefined();
    expect(custom.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(custom.events.some((e) => e.name === 'exception')).toBe(true);
    expect(parentIdOf(custom)).toBeDefined();
  });

  it('does not create todo.create when validation fails', async () => {
    const res = await request(app).post('/todos').send({});
    expect(res.status).toBe(400);
    expect(exporter.getFinishedSpans().some((s) => s.name === 'todo.create')).toBe(false);
  });
});
