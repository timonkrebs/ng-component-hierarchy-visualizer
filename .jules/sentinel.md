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

## 2025-02-17 - Template Helper Regex Injection Fix
**Vulnerability:** `scripts/template.helper.js` was using a dynamically constructed regex to find import paths for components. This was vulnerable to regex injection if component names contained special characters and also led to false positives where commented-out imports were incorrectly identified as valid dependencies.
**Learning:** Reusing existing safe tools (like `findImportPath` which uses AST) is better than re-implementing logic with regex, especially for code parsing.
**Prevention:** Updated `scripts/template.helper.js` to use `findImportPath` from `scripts/route.helper.js`, passing the AST directly to avoid re-parsing and ensure accurate import resolution.

## 2025-02-17 - Service Helper Regex Injection Fix
**Vulnerability:** `scripts/service.helper.js` relied on a dynamically constructed regex to identify service imports. This approach was susceptible to regex injection if service names included special characters and could incorrectly identify commented-out imports as valid dependencies.
**Learning:** Consistent application of security patterns is crucial. Even if other parts of the system are secure (e.g., component helpers), ignoring similar patterns in other modules (like service helpers) leaves gaps.
**Prevention:** Updated `scripts/service.helper.js` to use `findImportPath` from `scripts/route.helper.js`, leveraging the robust AST parsing already established in the project.
