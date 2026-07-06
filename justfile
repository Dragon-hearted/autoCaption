# AutoEditor
set dotenv-load := true

# List all recipes
default:
  @just --list

# ─── Development ────────────────────────────────────────

# Run tests
test:
  bun run test

# Run tests in watch mode
test-watch:
  bun run test:watch

# Lint code
lint:
  bun run lint

# Format code
format:
  bun run format

# Type check
typecheck:
  bun run typecheck

# Open Remotion studio
dev:
  bun run studio

# Run CLI
render *args:
  bun run src/cli.ts {{args}}

# Order a sliced storyboard project's clips (Block→variant→scene) into
# scenes/palmier-plan.json for the palmier editor.
#   just plan <project-dir>
plan *args:
  bun run src/cli.ts plan {{args}}

# ─── Setup ──────────────────────────────────────────────

# Install dependencies
install:
  bun install
