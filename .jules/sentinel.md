## 2024-12-14 - ReDoS in Route Extraction
**Vulnerability:** A ReDoS (Regular Expression Denial of Service) vulnerability was found in `scripts/component.helper.js` where a regex was used to find routing modules in TypeScript imports. The regex `/(import|export)\s+\{?[^}]+\}?\s+from\s+'(.+\/.*routing.*|.+routes)'/` used greedy quantifiers (`.+`, `.*`) nested within each other or in a way that caused catastrophic backtracking when matching against long strings that didn't contain the expected `routing` keyword.
**Learning:** Using regex to parse code (imports) with loose patterns (`.*`) is dangerous. Specifically, matching "any character" (`.`) until a keyword is found can trigger O(N^2) or worse performance if the keyword is missing.
**Prevention:**
1. Avoid `.*` and `.+` in regexes used on untrusted or large inputs, especially when looking for substrings.
2. Use `matchAll` to extract relevant parts (like import paths) first using a simple, safe regex, and then apply logic (like `includes` or simpler regexes) on the extracted small strings.
3. Prefer AST parsing over regex for code analysis whenever possible (though here regex was a fallback).
