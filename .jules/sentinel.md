## 2024-03-24 - Path Traversal in Component Imports
**Vulnerability:** The application was vulnerable to path traversal via malicious import paths in source files (e.g. `import ... from '../../../../etc/passwd'`). The `resolveComponents`, `addServices`, and `addTemplateElements` functions blindly resolved these relative paths against the project root, potentially allowing file reads outside the intended directory.
**Learning:** Even "internal" inputs like source code in a repository should be treated as untrusted input when building dev tools, especially those that parse and resolve file paths. Validating inputs only at the CLI argument level is insufficient.
**Prevention:** Enforce strict path containment checks (`isSafePath`) whenever a file path is constructed from an import statement or relative path, ensuring the resolved absolute path starts with the project root.

## 2024-05-22 - TOCTOU File Probing in Path Traversal Checks
**Vulnerability:** The application was checking for file existence (`fs.existsSync`) on constructed paths *before* validating if those paths were safe (`isSafePath`). This allowed an attacker (via malicious `loadChildren` paths) to probe for the existence of files on the system (e.g., `/etc/passwd`), even if reading them was blocked later.
**Learning:** Checking for file existence is a sensitive operation that leaks information. Validation must happen *before* any file system access, including existence checks.
**Prevention:** Always validate constructed paths against the allowed root directory (`isSafePath`) before passing them to any `fs` function, including `existsSync`, `stat`, etc.
