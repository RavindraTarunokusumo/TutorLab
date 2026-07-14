# System Architecture

## Entry Points

Document the main runtime entry points.

Example for Python/Flask App:

- `main.py` or `wsgi.py`: application entry point
- `src/app/__init__.py`: app factory or initialization
- `src/api/`: API routes
- `src/services/`: application services
- `src/models/`: persistence models

## Module Structure

Document each major module.

### `core/`

Infrastructure utilities.

### `data/`

Persistence and state management.

### `services/`

Application services and business workflows.

### `api/`

HTTP or external API surfaces.

### `ui/`

Frontend or templates, if applicable.

### `integrations/`

External systems, credentials, APIs, brokers, queues, cloud services.

## Data Flow

Describe the main runtime flow:

1. startup
2. request/event intake
3. state read/write
4. business logic
5. external side effects
6. response/event emission
7. logging and audit

## Background Jobs

Document schedulers, workers, queues, or cron tasks.

## External Integrations

Document every external dependency:

- API used
- auth method
- env vars
- failure behavior
- test mocking strategy

## Invariants

List architecture invariants that must not be violated.