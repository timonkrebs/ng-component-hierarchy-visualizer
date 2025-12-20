## 2024-12-14 - ReDoS in Route Extraction
**Vulnerability:** A ReDoS (Regular Expression Denial of Service) vulnerability was found in `scripts/component.helper.js` where a regex was used to find routing modules in TypeScript imports. The regex `/(import|export)\s+\{?[^}]+\}?\s+from\s+'(.+\/.*routing.*|.+routes)'/` used greedy quantifiers (`.+`, `.*`) nested within each other or in a way that caused catastrophic backtracking when matching against long strings that didn't contain the expected `routing` keyword.
**Learning:** Using regex to parse code (imports) with loose patterns (`.*`) is dangerous. Specifically, matching "any character" (`.`) until a keyword is found can trigger O(N^2) or worse performance if the keyword is missing.
**Prevention:**
1. Avoid `.*` and `.+` in regexes used on untrusted or large inputs, especially when looking for substrings.
2. Use `matchAll` to extract relevant parts (like import paths) first using a simple, safe regex, and then apply logic (like `includes` or simpler regexes) on the extracted small strings.
3. Prefer AST parsing over regex for code analysis whenever possible (though here regex was a fallback).

## 2025-02-17 - Regex Injection in Component Resolution
**Vulnerability:** In `scripts/component.helper.js`, a regex was dynamically constructed using the component name: `new RegExp("import...${route.component}...from")`. This allowed potential regex injection if the component name contained special characters. Furthermore, using regex to parse imports led to false positives where imports inside strings or comments were incorrectly identified as valid dependencies, potentially leading to incorrect diagrams or information leakage.
**Learning:** Regex-based parsing of source code is fragile and error-prone. It cannot easily distinguish between code, strings, and comments. AST parsing is robust against these issues.
**Prevention:** Replaced regex-based import extraction with AST parsing using `@typescript-eslint/typescript-estree`. Added a helper `findImportPath` in `scripts/route.helper.js` to safely locate imports.

## 2025-02-18 - Persistent Regex Injection in Template Helper
**Vulnerability:** The previous fix for Regex Injection in component resolution was incomplete. `scripts/template.helper.js` still contained a dynamic `new RegExp` construction using `componentName` to find imports (`new RegExp("import...${componentName}...")`). This posed the same ReDoS and injection risks as the previously fixed instance.
**Learning:** When fixing a vulnerability pattern (like dynamic regex construction), searching the entire codebase for similar patterns is crucial to ensure complete remediation. AST parsing is consistently superior to regex for code analysis.
**Prevention:** Replaced the remaining dynamic regex in `scripts/template.helper.js` with the `findImportPath` AST-based helper from `scripts/route.helper.js`.
