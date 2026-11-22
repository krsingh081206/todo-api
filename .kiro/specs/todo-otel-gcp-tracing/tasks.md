# Tasks: Todo OpenTelemetry GCP Cloud Tracing PoC

## 1. Project Setup and Configuration

- [x] 1.1 Initialize Node.js project with package.json and CommonJS module system
- [x] 1.2 Install application dependencies: express (^4.18), pg (^8.11), pino (^9.0), pino-http (^9.0)
- [x] 1.3 Install OpenTelemetry dependencies: @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources
- [x] 1.4 Install development dependencies: vitest, supertest, fast-check
- [x] 1.5 Configure package.json scripts: start (node --require ./tracing.js ./app.js), test (vitest --run)
- [x] 1.6 Set up .env file with default configuration values (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, LOG_LEVEL, OTEL_EXPORTER_OTLP_ENDPOINT, PORT)

## 2. OpenTelemetry Tracing Setup

- [x] 2.1 Create tracing.js module that initializes NodeSDK with OTLP gRPC exporter pointing to localhost:4317
- [x] 2.2 Configure resource attributes in tracing.js: service.name ("todo-api"), service.version ("1.0.0"), deployment.environment (from NODE_ENV)
- [x] 2.3 Register getNodeAutoInstrumentations() with @opentelemetry/instrumentation-fs disabled
- [x] 2.4 Configure BatchSpanProcessor with OTLPTraceExporter using OTEL_EXPORTER_OTLP_ENDPOINT env var (default: http://localhost:4317)
- [x] 2.5 Verify tracing.js loads before application code via --require flag

## 3. Database Layer

- [x] 3.1 Create db.js module with createPool() function using pg.Pool and environment variables for configuration (max: 10 connections)
- [x] 3.2 Create migration script that creates todos table (id SERIAL PK, title VARCHAR(255) NOT NULL, description TEXT, completed BOOLEAN DEFAULT FALSE, created_at/updated_at TIMESTAMPTZ DEFAULT NOW()) and idx_todos_completed index
- [x] 3.3 Implement runMigrations(pool) function that executes the migration SQL on startup and throws DatabaseMigrationError on failure
- [x] 3.4 Create TodoRepository module with create(), findAll(), findById(), update(), delete() methods using parameterized queries
- [x] 3.5 Verify all SQL queries use parameterized inputs ($1, $2, etc.) — no string concatenation

## 4. Logger Setup

- [x] 4.1 Create logger.js module that exports a Pino logger configured for GCP Cloud Logging compatibility: ISO 8601 timestamp (pino.stdTimeFunctions.isoTime), string severity via formatters.level (label.toUpperCase()), log level from LOG_LEVEL env var, prettyPrint based on NODE_ENV
- [x] 4.2 Verify @opentelemetry/instrumentation-pino auto-instrumentation injects trace_id and span_id into log entries when a span is active
- [x] 4.3 Configure pino-http middleware for automatic HTTP request logging

## 5. Input Validation

- [x] 5.1 Create validation.js module with validateCreateTodoInput(body) function
- [x] 5.2 Implement title validation: required, non-empty string, 1-255 characters
- [x] 5.3 Implement description validation: optional, nullable, max 1000 characters
- [x] 5.4 Create validateUpdateTodoInput(body) function requiring at least one field (title, description, completed)
- [x] 5.5 Ensure validation functions return { valid, errors, data } and do not mutate input

## 6. Express Application and Routes

- [x] 6.1 Create app.js with Express app, express.json() middleware, and pino-http request logger
- [x] 6.2 Implement POST /todos route handler with validation, database insert, 201/400/500 responses
- [x] 6.3 Implement GET /todos route handler returning array of todos ordered by created_at DESC
- [x] 6.4 Implement GET /todos/:id route handler with ID validation, 200/404/400 responses
- [x] 6.5 Implement PUT /todos/:id route handler with partial update using COALESCE, 200/404/400 responses
- [x] 6.6 Implement DELETE /todos/:id route handler with 204/404/400 responses
- [x] 6.7 Implement error handling middleware that catches database errors, logs with trace_id, records exception on span, returns 500
- [x] 6.8 Verify each route handler has an active span (auto-created by Express instrumentation) and sets http.status_code attribute

## 7. Custom Span Creation

- [x] 7.1 Add custom span "todo.create" in POST /todos handler using trace.getTracer("todo-api").startSpan()
- [x] 7.2 Set span attributes on custom span: todo.title, todo.id
- [x] 7.3 Verify custom spans appear as child of the Express route span in trace hierarchy

## 8. Unit Tests

- [x] 8.1 Write unit tests for validateCreateTodoInput: valid input, empty title, missing title, oversized title (>255), valid description, oversized description (>1000), null/undefined body
- [x] 8.2 Write unit tests for validateUpdateTodoInput: valid partial update, all fields absent (should fail), title only, completed only, description null
- [x] 8.3 Write unit tests for ErrorResponse formatting: verify { error: { code, message } } structure
- [x] 8.4 Write unit tests for TracingConfig parsing from environment variables
- [x] 8.5 Verify 90%+ code coverage for validation and utility modules

## 9. Property-Based Tests

- [ ] 9.1 Set up fast-check in test configuration
- [ ] 9.2 Write property test: for any valid CreateTodoInput, validateCreateTodoInput returns { valid: true, data: <input> } with no mutations
- [ ] 9.3 Write property test: for any string >255 chars as title, validateCreateTodoInput returns { valid: false }
- [ ] 9.4 Write property test: for any UpdateTodoInput with all fields undefined, validateUpdateTodoInput returns { valid: false }
- [ ] 9.5 Write property test: create → get → update → delete lifecycle returns consistent data at each step

## 10. Integration Tests

- [ ] 10.1 Set up test PostgreSQL instance for integration tests
- [ ] 10.2 Write API integration tests using supertest for each CRUD endpoint (status codes and response bodies)
- [ ] 10.3 Write tracing integration tests with mock OTLP collector or in-memory exporter — verify span names, attributes, parent-child relationships
- [ ] 10.4 Write log correlation tests — capture stdout, verify log entries contain trace_id and span_id matching produced traces
- [ ] 10.5 Write database error handling test — simulate DB failure, verify 500 response and span exception recording

## 11. OTel Collector Configuration

- [x] 11.1 Create otel-collector-config.yaml with OTLP gRPC receiver on 0.0.0.0:4317
- [x] 11.2 Configure batch processor (send_batch_size: 512, timeout: 5s)
- [x] 11.3 Configure resource processor to add cloud.platform=gcp_kubernetes_engine attribute
- [x] 11.4 Configure googlecloud exporter for Cloud Trace
- [x] 11.5 Define service pipeline: traces → [resource, batch] → [googlecloud]

## 12. GKE Deployment Manifests

- [x] 12.1 Create Kubernetes Namespace manifest for todo-app
- [x] 12.2 Create Deployment manifest for todo-api with two containers: todo-api and otel-collector (sidecar)
- [x] 12.3 Configure todo-api container with DB_HOST (Cloud SQL private IP), DB_PORT (5432), DB_NAME, DB_USER, DB_PASSWORD supplied from Kubernetes Secrets/ConfigMap (never hardcoded); the app connects directly to the Cloud SQL private IP with no proxy sidecar
- [x] 12.4 Document and verify the private IP networking prerequisite: the GKE cluster is VPC-native and the Cloud SQL instance has a private IP via Private Service Access on the same VPC (or a peered/reachable VPC), so pods can reach the instance on port 5432 (configuration/documentation step only; no in-cluster Postgres manifests)
- [x] 12.5 Mount otel-collector-config.yaml as a ConfigMap in the otel-collector container
- [x] 12.6 Create Kubernetes Service for todo-api (ClusterIP :8080)
- [x] 12.7 Create GKE Ingress manifest (HTTP LoadBalancer) routing to todo-api service
- [x] 12.8 Configure node service account authentication for Cloud Trace: grant the GKE node pool's service account roles/cloudtrace.agent and ensure the node pool has the cloud-platform (or trace.append) access scope, so the collector authenticates via Application Default Credentials from the node metadata server (no key files, no Workload Identity)

## 13. End-to-End Verification

- [x] 13.1 Deploy to GKE and verify application starts successfully (migrations run, server listens on :8080)
- [ ] 13.2 Make requests to all 5 CRUD endpoints and verify traces appear in Cloud Trace with correct service.name
- [ ] 13.3 Verify trace hierarchy: Express route span → custom span → database span (parent-child)
- [ ] 13.4 Verify log entries in Cloud Logging contain trace_id matching traces in Cloud Trace
- [ ] 13.5 Send request with W3C traceparent header and verify trace continuity in Cloud Trace
- [ ] 13.6 Simulate database failure and verify 500 response, span exception attributes, and error trace in Cloud Trace
- [ ] 13.7 Send 10 requests and verify span count in Cloud Trace equals or exceeds expected number
