# Testing Guide

## Purpose

Testing includes both execution and planning.

## Prerequisites

- activate the project environment
- run commands from repo root
- mock external services
- avoid real credentials in tests

## Test Layout

Document test groups:

- API tests:
- service tests:
- persistence tests:
- integration tests:
- frontend tests:
- fixtures:

## Core Fixtures

Document shared fixtures and helpers. 

**Note: Python as an example - use other frameworks for different language.**

## Running Tests

Run all tests:

```bash
pytest
```

Run one file:

```bash
pytest tests/test_example.py
```

Run one test:

```bash
pytest tests/test_example.py::test_name -v
```

Run by keyword:

```bash
pytest -k "keyword"
```

Stop on first failure:

```bash
pytest -x
```

## Pre-commit Checks
Run the pre-commit checks and tests before any commits.
