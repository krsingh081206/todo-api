'use strict';

// Loaded via `node --require ./tracing.js ./app.js` so instrumentation
// patches libraries before application code requires them.
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');

function initializeTracing() {
  try {
    const sdk = new NodeSDK({
      resource: new Resource({
        'service.name': 'todo-api',
        'service.version': '1.0.0',
        'deployment.environment': process.env.NODE_ENV || 'development',
      }),
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
          }),
          { scheduledDelayMillis: 5000, maxExportBatchSize: 512 }
        ),
      ],
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();

    process.once('SIGTERM', () => {
      sdk.shutdown().catch(() => {});
    });

    return sdk;
  } catch (err) {
    // Tracing failures must never affect application availability.
    console.error('OpenTelemetry initialization failed:', err.message);
    return undefined;
  }
}

initializeTracing();

module.exports = { initializeTracing };
