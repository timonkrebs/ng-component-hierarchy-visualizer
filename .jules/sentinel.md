## 2024-02-14 - Path Traversal in File Reading
**Vulnerability:** User-controlled file paths in `scripts/main.helper.js` allowed directory traversal via `../`.
**Learning:** `path.join` with user input is insufficient for security. Checking if a path simply `startsWith` a base path is vulnerable to partial path matches (e.g., `/safe/app_secret` starts with `/safe/app`).
**Prevention:** Use `path.resolve` to get absolute paths and verify the target path starts with `resolvedBasePath + path.sep`.
