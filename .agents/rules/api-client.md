---
name: API Calling Guidelines
description: Enforce TanStack Query and apiClient for all API calls
---

# API Calling Guidelines

When making API calls in the frontend of this repository:

1. **Use `apiClient` instead of `axios` directly**: All API calls should be made using `apiClient` (from `@/lib/apiClient`). Do not use `axios.get`, `axios.post`, or `fetch` directly to hit backend endpoints, as `apiClient` automatically handles authentication tokens and base URL configurations.
2. **Use the "TanStack Way"**:
   - For fetching data inside React components, use `useQuery` from `@tanstack/react-query`.
   - For mutations (POST, PUT, DELETE, etc.), use `useMutation`.
   - For fetching data in imperative code (e.g. inside a form submit handler or async function), use `queryClient.fetchQuery()` instead of raw API calls so the result is cached and integrated with the React Query ecosystem.
