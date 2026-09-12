---
description: General coding standards, UI patterns, and architectural guidelines for AI-RepoMind.
---

# Coding Standards & Best Practices

When working on this codebase, always adhere to the following rules:

## 1. DRY Principle (Don't Repeat Yourself)
- Actively look for duplicated logic and refactor it into shared utilities, custom React hooks, or base classes.
- Ensure that configuration, API URLs, and common constants are defined in a single source of truth.

## 2. Modular & Component-Wise Organization
- **Frontend**: Break down UI features into small, reusable React components. Each component should ideally live in its own file and handle a single responsibility.
- **Backend**: Keep route handlers lightweight. Complex business logic should be abstracted into dedicated service modules (e.g., `repo_manager.py`, `pipeline.py`) rather than cluttering API router files.

## 3. Commenting Complex Logic
- Always write single-line comments directly above any non-trivial or slightly complex logic.
- Comments should explain the *why* behind a decision or summarize *what* the block does, making it instantly understandable for future developers.

## 4. UI Loading States & Skeletons
- Always implement **Loading Skeletons** in the UI when fetching or loading data.
- Do not rely solely on simple loading spinners; skeleton screens provide a significantly better user experience by preserving layout stability and improving perceived performance.
