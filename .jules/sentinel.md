## 2024-03-24 - Path Traversal in Component Imports
**Vulnerability:** The application was vulnerable to path traversal via malicious import paths in source files (e.g. `import ... from '../../../../etc/passwd'`). The `resolveComponents`, `addServices`, and `addTemplateElements` functions blindly resolved these relative paths against the project root, potentially allowing file reads outside the intended directory.
**Learning:** Even "internal" inputs like source code in a repository should be treated as untrusted input when building dev tools, especially those that parse and resolve file paths. Validating inputs only at the CLI argument level is insufficient.
**Prevention:** Enforce strict path containment checks (`isSafePath`) whenever a file path is constructed from an import statement or relative path, ensuring the resolved absolute path starts with the project root.

## 2025-02-18 - File Existence Probe in LoadChildren
**Vulnerability:** The application checked for the existence of files (using `fs.existsSync` and `fs.lstatSync`) based on user-supplied paths in `loadChildren` *before* verifying if those paths were safe. This allowed an attacker to probe for the existence of files outside the project directory (TOCTOU / Information Disclosure).
**Learning:** Checking for file existence is a privileged operation that can leak information. Always validate path safety (`isSafePath`) *before* performing any file system operations, including existence checks.
**Prevention:** Moved the `isSafePath` check to before any `fs` calls in `scripts/component.helper.js`.

## 2026-02-02 - Symlink Traversal via isSafePath Bypass
**Vulnerability:** The `isSafePath` function only performed a logical check on file paths. It did not resolve symbolic links, allowing an attacker to create a symlink inside the project root pointing to an external file (e.g., `/etc/passwd`) and bypass the containment check.
**Learning:** Logical path checks are insufficient when symbolic links are involved. A path can "look" safe (start with the project root) but physically point elsewhere. `path.resolve` does NOT resolve symlinks.
**Prevention:** Updated `isSafePath` to perform a physical containment check using `fs.realpathSync` (when the file exists) to verify that the canonical path is also within the project root.
