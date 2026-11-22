# Requirements: Todo OpenTelemetry GCP Cloud Tracing PoC

## 1. Tracing and Observability

### Requirement 1.1: Trace ID Correlation Between Logs and Traces

**User Story**: As a developer debugging an issue, I want log entries to contain the same trace_id as the corresponding trace span, so that I can correlate logs with traces in GCP Cloud Trace.

**Acceptance Criteria**:
- For every HTTP request that results in at least one log entry, the log entry's `trace_id` field must match the `trace_id` of the span created for that HTTP request.
- The `@opentelemetry/instrumentation-pino` auto-instrumentation must inject `trace_id` and `span_id` into every Pino log entry when a span is active.
- Log entries without an active span must not contain `trace_id` or `span_id` fields.

### Requirement 1.2: Span Hierarchy for Database Operations

**User Story**: As a developer analyzing traces, I want database spans to appear as child spans of the route handler span, so that I can see the full request execution hierarchy in Cloud Trace.

**Acceptance Criteria**:
- Every database span created by the `pg` auto-instrumentation must be a child span of the Express route handler span for the request that triggered the database operation.
- Database spans must include attributes: `db.system=postgresql`, `db.statement`, `net.peer.name`, `net.peer.port`.
- The parent-child relationship must be established via OpenTelemetry context propagation.

### Requirement 1.3: All CRUD Endpoints Produce Traces

**User Story**: As a developer, I want every CRUD endpoint to produce a trace, so that I can monitor all API operations in Cloud Trace.

**Acceptance Criteria**:
- Each of the five CRUD endpoints (POST /todos, GET /todos, GET /todos/:id, PUT /todos/:id, DELETE /todos/:id) must produce at least one trace in Cloud Trace when called successfully.
- Each trace must include the correct HTTP method and route attributes (`http.method`, `http.route`, `http.status_code`).

### Requirement 1.4: Error Traces Include Exception Attributes

**User Story**: As a developer investigating errors, I want error traces to include exception information, so that I can diagnose failures from the trace alone.

**Acceptance Criteria**:
- When a request results in a 500 error (e.g., database unavailable), the corresponding trace span must include exception information via `recordException()`.
- The span status must be set to ERROR.
- The exception type and message must be recorded as span attributes or events.

### Requirement 1.5: Trace Context Propagation via W3C Traceparent

**User Story**: As a developer tracing requests across services, I want the application to honor incoming W3C trace context, so that distributed traces span multiple services correctly.

**Acceptance Criteria**:
- When a client sends a request with a `traceparent` header (W3C Trace Context format), the application's server span must continue the same trace rather than starting a new one.
- The server span must be a child of the propagated trace.
- The `trace_id` in Cloud Trace must match the `trace_id` from the incoming `traceparent` header.

### Requirement 1.6: No Traces Lost During Normal Operation

**User Story**: As a developer, I want all spans to be exported to Cloud Trace, so that I have complete visibility into application behavior.

**Acceptance Criteria**:
- Under normal operation (collector available, no memory pressure), every span created by the application must be exported to Cloud Trace within the batch export interval (default 5 seconds).
- The `BatchSpanProcessor` must buffer spans in memory and export them in batches.

## 2. Todo CRUD Operations

### Requirement 2.1: Create Todo

**User Story**: As a user, I want to create a new todo item, so that I can track my tasks.

**Acceptance Criteria**:
- POST /todos with a valid body (`title` required, 1-255 chars; `description` optional, nullable, max 1000 chars) must return HTTP 201 with the created todo as JSON.
- The created todo must include an auto-generated `id`, `completed` (default false), `created_at`, and `updated_at` timestamps.
- POST /todos with an empty or missing title must return HTTP 400 with an `ErrorResponse` (code: "VALIDATION_ERROR").
- POST /todos with a title exceeding 255 characters must return HTTP 400.
- The SQL INSERT must use parameterized queries to prevent SQL injection.

### Requirement 2.2: List Todos

**User Story**: As a user, I want to list all todo items, so that I can see my tasks.

**Acceptance Criteria**:
- GET /todos must return HTTP 200 with a JSON array of todo objects.
- The array must be ordered by `created_at` descending.
- An empty database must return an empty array (HTTP 200), not an error.

### Requirement 2.3: Get Todo by ID

**User Story**: As a user, I want to retrieve a specific todo by its ID, so that I can view its details.

**Acceptance Criteria**:
- GET /todos/:id with a valid ID that exists must return HTTP 200 with the todo as JSON.
- GET /todos/:id with a valid ID that does not exist must return HTTP 404 with an `ErrorResponse` (code: "NOT_FOUND").
- GET /todos/:id with a non-numeric or non-positive ID must return HTTP 400 with an `ErrorResponse` (code: "VALIDATION_ERROR").

### Requirement 2.4: Update Todo

**User Story**: As a user, I want to update an existing todo item, so that I can modify its details.

**Acceptance Criteria**:
- PUT /todos/:id with a valid ID and at least one updatable field (`title`, `description`, `completed`) must return HTTP 200 with the updated todo as JSON.
- The `updated_at` field must reflect the current time after update.
- PUT /todos/:id with a valid ID that does not exist must return HTTP 404.
- PUT /todos/:id with no updatable fields provided must return HTTP 400 (at least one field required).
- The update must be atomic (single SQL UPDATE statement with RETURNING clause).
- SQL must use parameterized queries with COALESCE for partial updates.

### Requirement 2.5: Delete Todo

**User Story**: As a user, I want to delete a todo item, so that I can remove completed or unwanted tasks.

**Acceptance Criteria**:
- DELETE /todos/:id with a valid ID that exists must return HTTP 204 with no response body.
- DELETE /todos/:id with a valid ID that does not exist must return HTTP 404.
- DELETE /todos/:id with a non-numeric or non-positive ID must return HTTP 400.

## 3. OpenTelemetry SDK Configuration

### Requirement 3.1: SDK Initialization Before Application Code

**User Story**: As a developer, I want the OpenTelemetry SDK to initialize before any application code loads, so that auto-instrumentation can patch libraries before they are used.

**Acceptance Criteria**:
- The tracing module must be loaded via `--require` flag before the application starts (e.g., `node --require ./tracing.js ./app.js`).
- The NodeSDK must be configured with a `BatchSpanProcessor` and OTLP gRPC exporter.
- `getNodeAutoInstrumentations()` must be registered, enabling automatic spans for Express, HTTP, pg, and Pino.
- Resource attributes must include `service.name` ("todo-api"), `service.version`, and `deployment.environment`.
- The `@opentelemetry/instrumentation-fs` instrumentation must be disabled to reduce noise.

### Requirement 3.2: OTLP gRPC Export to Sidecar

**User Story**: As a developer, I want traces exported to the sidecar collector via OTLP gRPC, so that the collector can forward them to Cloud Trace.

**Acceptance Criteria**:
- The OTLP trace exporter must be configured to send traces to `localhost:4317` (sidecar collector).
- The exporter endpoint must be configurable via the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable.
- Trace export failures must not affect application availability.

### Requirement 3.3: Auto-Instrumentation Coverage

**User Story**: As a developer, I want automatic instrumentation for HTTP, Express, PostgreSQL, and Pino, so that I get tracing coverage without manual instrumentation code.

**Acceptance Criteria**:
- Express route handlers must produce server spans with `http.method`, `http.route`, and `http.status_code` attributes.
- HTTP client/server operations must produce spans automatically.
- PostgreSQL queries via `pg` must produce database spans with `db.system=postgresql` and `db.statement` attributes.
- Pino log entries must automatically include `trace_id` and `span_id` when a span is active.

## 4. Structured Logging

### Requirement 4.1: Pino Structured JSON Logging

**User Story**: As a developer, I want structured JSON logs sent to stdout, so that GKE can capture them and send to Cloud Logging.

**Acceptance Criteria**:
- All log output must be structured JSON written to stdout.
- Each log entry must include `severity` (string, e.g. "INFO"), `timestamp` (ISO 8601 string), `pid`, `hostname`, and `msg` fields — GCP Cloud Logging compatible format.
- Pino must be configured with `timestamp: pino.stdTimeFunctions.isoTime` to emit ISO 8601 timestamps instead of epoch milliseconds.
- Pino must be configured with a `formatters.level` function that maps the numeric level to a `severity` string (uppercase, e.g. "INFO", "WARNING", "ERROR").
- Pretty-print must be disabled in production (GKE) for Cloud Logging compatibility.
- Log level must be configurable via the `LOG_LEVEL` environment variable.

### Requirement 4.2: Pino Trace Context Injection

**User Story**: As a developer, I want trace context automatically injected into log entries, so that I can correlate logs with traces without manual code.

**Acceptance Criteria**:
- The `@opentelemetry/instrumentation-pino` auto-instrumentation must inject `trace_id`, `span_id`, and `trace_flags` into every log entry when a span is active.
- No manual code in the application is needed to add trace context to logs.
- Log entries produced outside of a span context must not contain trace fields.

## 5. Security

### Requirement 5.1: Parameterized SQL Queries

**User Story**: As a developer, I want all SQL queries to use parameterized inputs, so that the application is protected against SQL injection.

**Acceptance Criteria**:
- All SQL queries must use parameterized inputs (`$1`, `$2`, etc.) — no string concatenation for query construction.
- The `pg` library's parameterized query API must be used for all database operations.

### Requirement 5.2: Input Validation

**User Story**: As a developer, I want all request bodies validated before database operations, so that invalid or malicious data cannot reach the database.

**Acceptance Criteria**:
- All request bodies must be validated before any database operation.
- `title` must be a non-empty string, 1-255 characters.
- `description` if provided must be nullable, max 1000 characters.
- `completed` if provided must be a boolean.
- For updates, at least one field must be provided.
- Validation must not mutate the input parameter.
- Invalid input must result in HTTP 400 with descriptive error messages.

### Requirement 5.3: No Secrets in Code

**User Story**: As a developer, I want database credentials and configuration provided via environment variables, so that no secrets are hardcoded in the application.

**Acceptance Criteria**:
- Database credentials (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) must be read from environment variables.
- No hardcoded credentials in application source code.
- In GKE, `DB_HOST` (the Cloud SQL private IP), `DB_PORT` (5432), `DB_NAME`, `DB_USER`, and `DB_PASSWORD` must be provided via Kubernetes Secrets/ConfigMap, not hardcoded.

## 6. GKE Deployment and Infrastructure

### Requirement 6.1: GKE Deployment with OTel Collector Sidecar

**User Story**: As a platform engineer, I want the OTel collector running as a sidecar in the same pod as the Todo API, so that traces can be collected locally and forwarded to Cloud Trace.

**Acceptance Criteria**:
- The OTel collector must run as a sidecar container in the same pod as the Todo API container.
- The pod must contain exactly two containers: the Todo API and the OTel collector sidecar.
- The collector must accept OTLP gRPC trace exports on `localhost:4317`.
- The collector must batch spans (batch size 512, timeout 5s) before exporting.
- The collector must add GCP-specific resource attributes (`cloud.platform=gcp_kubernetes_engine`).
- The collector must export traces to GCP Cloud Trace using the `googlecloud` exporter.

### Requirement 6.2: GKE Node Service Account Authentication

**User Story**: As a platform engineer, I want the collector to authenticate to Cloud Trace using the GKE node pool's service account, so that no key files or explicit credentials are needed.

**Acceptance Criteria**:
- The collector must use Application Default Credentials resolved from the node's service account via the metadata server.
- The GKE node pool's service account must have `roles/cloudtrace.agent`, and the node pool must have the `cloud-platform` (or `trace.append`) access scope.
- No explicit credentials or key files may be present in the collector config.
- If node service account authentication is misconfigured, the application must continue to function normally (tracing failure does not affect availability).

### Requirement 6.3: GKE Ingress and Service Configuration

**User Story**: As a platform engineer, I want a GKE Ingress and Service configured, so that external clients can reach the Todo API.

**Acceptance Criteria**:
- A GKE Ingress (HTTP LoadBalancer) must route external traffic to the Todo API service.
- A Kubernetes Service (ClusterIP :8080) must expose the Todo API within the cluster.
- The database is Cloud SQL for PostgreSQL, reached directly over its private IP (Private Service Access); the GKE cluster must be VPC-native and on the same VPC as, or able to reach, the Cloud SQL instance.
- No PostgreSQL workloads, volumes, or Services are deployed in the cluster.

## 7. Database

### Requirement 7.1: PostgreSQL Connection Pool

**User Story**: As a developer, I want a PostgreSQL connection pool, so that database connections are efficiently managed.

**Acceptance Criteria**:
- A `pg.Pool` must be created with configurable host, port, database, user, password, and max connections (pool size).
- The pool size must default to 10 connections.
- Connection lifecycle must be managed by the pool (connections created on demand, reused).
- The pool must be initialized before the Express application starts accepting requests.

### Requirement 7.2: Database Error Handling

**User Story**: As a developer, I want database errors handled gracefully, so that the application returns appropriate error responses and logs the errors with trace context.

**Acceptance Criteria**:
- Database connection errors must be caught by route handlers.
- Errors must be logged via Pino with the active `trace_id`.
- The active span must record the exception via `recordException()` and set status to ERROR.
- The response must be HTTP 500 with an `ErrorResponse` (code: "INTERNAL_ERROR", message: "Database error").
- The connection pool must automatically retry connections when PostgreSQL becomes available.

### Requirement 7.3: Database Schema and Migrations

**User Story**: As a developer, I want the database schema created automatically, so that the application can start with a fresh database.

**Acceptance Criteria**:
- The `todos` table must be created with columns: `id` (SERIAL PRIMARY KEY), `title` (VARCHAR(255) NOT NULL), `description` (TEXT), `completed` (BOOLEAN NOT NULL DEFAULT FALSE), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()), `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()).
- An index `idx_todos_completed` must be created on the `completed` column.
- Migrations must run on application startup before the HTTP server starts listening.
- Migration failure must prevent the application from starting (log error and exit).
