## 2024-03-24 - Path Traversal in Component Imports
**Vulnerability:** The application was vulnerable to path traversal via malicious import paths in source files (e.g. `import ... from '../../../../etc/passwd'`). The `resolveComponents`, `addServices`, and `addTemplateElements` functions blindly resolved these relative paths against the project root, potentially allowing file reads outside the intended directory.
**Learning:** Even "internal" inputs like source code in a repository should be treated as untrusted input when building dev tools, especially those that parse and resolve file paths. Validating inputs only at the CLI argument level is insufficient.
**Prevention:** Enforce strict path containment checks (`isSafePath`) whenever a file path is constructed from an import statement or relative path, ensuring the resolved absolute path starts with the project root.

## 2025-02-18 - File Existence Probe in LoadChildren
**Vulnerability:** The application checked for the existence of files (using `fs.existsSync` and `fs.lstatSync`) based on user-supplied paths in `loadChildren` *before* verifying if those paths were safe. This allowed an attacker to probe for the existence of files outside the project directory (TOCTOU / Information Disclosure).
**Learning:** Checking for file existence is a privileged operation that can leak information. Always validate path safety (`isSafePath`) *before* performing any file system operations, including existence checks.
**Prevention:** Moved the `isSafePath` check to before any `fs` calls in `scripts/component.helper.js`.

## 2025-02-18 - Path Traversal via Symlinks
**Vulnerability:** The `isSafePath` check relied solely on `path.resolve`, which performs logical path resolution. This allowed an attacker to bypass the check using symlinks (e.g., a file inside the project pointing to `/etc/passwd`), as the logical path would appear to be within the project root.
**Learning:** Logical path resolution is insufficient when the file system supports symlinks. Security checks must verify the *physical* path on disk to ensure it truly resides within the intended directory.
**Prevention:** Updated `isSafePath` to use `fs.realpathSync` (when the file exists) to resolve the canonical path before verifying it starts with the project root.
