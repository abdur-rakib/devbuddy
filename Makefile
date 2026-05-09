.PHONY: install build dev start test test-watch lint lint-fix docker-build docker-up docker-down docker-logs clean setup help

# Default target
.DEFAULT_GOAL := help

# ──────────────────────────────────────────────
# Variables
# ──────────────────────────────────────────────
NODE_BIN   := ./node_modules/.bin
TSC        := $(NODE_BIN)/tsc
VITEST     := $(NODE_BIN)/vitest
IMAGE_NAME := devbuddy-bot

# ──────────────────────────────────────────────
# Setup & Dependencies
# ──────────────────────────────────────────────

## Install all dependencies
install:
	npm ci

## First-time project setup (install + env file + data dir)
setup: install
	@test -f .env || (cp .env.example .env && echo "📄 Created .env from .env.example — edit it with your tokens")
	@mkdir -p data
	@echo "✅ Setup complete. Edit .env before running."

# ──────────────────────────────────────────────
# Development
# ──────────────────────────────────────────────

## Start development server with hot-reload
dev:
	npx tsx watch src/index.ts

## Build TypeScript to JavaScript
build:
	$(TSC)

## Start the production bot
start: build
	node dist/index.js

# ──────────────────────────────────────────────
# Testing
# ──────────────────────────────────────────────

## Run all tests once
test:
	$(VITEST) run

## Run tests in watch mode
test-watch:
	$(VITEST)

# ──────────────────────────────────────────────
# Linting & Type Checking
# ──────────────────────────────────────────────

## Type-check without emitting files
lint:
	$(TSC) --noEmit

## Type-check and report errors (alias for CI)
lint-fix: lint

# ──────────────────────────────────────────────
# Docker
# ──────────────────────────────────────────────

## Build the Docker image
docker-build:
	docker build -t $(IMAGE_NAME) .

## Start services via docker-compose
docker-up:
	docker compose up -d

## Stop services via docker-compose
docker-down:
	docker compose down

## Show container logs (follow)
docker-logs:
	docker compose logs -f

# ──────────────────────────────────────────────
# Cleanup
# ──────────────────────────────────────────────

## Remove build artifacts and caches
clean:
	rm -rf dist
	rm -rf node_modules
	rm -f *.db *.db-journal

# ──────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────

## Show this help message
help:
	@echo ""
	@echo "  DevBuddy — Makefile Targets"
	@echo "  ─────────────────────────────────────"
	@echo ""
	@echo "  Setup & Dependencies"
	@echo "    make install        Install dependencies (npm ci)"
	@echo "    make setup          First-time setup (install + .env + data dir)"
	@echo ""
	@echo "  Development"
	@echo "    make dev            Start dev server with hot-reload"
	@echo "    make build          Compile TypeScript → JavaScript"
	@echo "    make start          Build and run the production bot"
	@echo ""
	@echo "  Testing & Linting"
	@echo "    make test           Run all tests"
	@echo "    make test-watch     Run tests in watch mode"
	@echo "    make lint           Type-check the project"
	@echo ""
	@echo "  Docker"
	@echo "    make docker-build   Build the Docker image"
	@echo "    make docker-up      Start containers (detached)"
	@echo "    make docker-down    Stop containers"
	@echo "    make docker-logs    Tail container logs"
	@echo ""
	@echo "  Cleanup"
	@echo "    make clean          Remove dist/, node_modules/, and DB files"
	@echo ""
