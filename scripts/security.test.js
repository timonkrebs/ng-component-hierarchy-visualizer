
import { generateMermaid } from './main.helper.js';
import { stripJsonComments } from './json.helper.js';
import { resolveComponents } from './component.helper.js';
import { getImportsAndExports } from './route.helper.js';
import { jest } from '@jest/globals';

describe('Security Checks', () => {
    describe('Mermaid XSS Prevention', () => {
        it('should escape HTML characters in labels', () => {
            const routes = [{
                componentName: 'Unsafe<script>alert(1)</script>Component',
                parent: 'Parent',
                lazy: false,
                type: 'component',
                path: 'unsafe',
                subgraph: null
            }];

            const diagram = generateMermaid(routes);
            expect(diagram).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
            expect(diagram).not.toContain('<script>');
        });

        it('should escape quotes in labels', () => {
             const routes = [{
                componentName: 'Quote"Component',
                parent: 'Parent',
                lazy: false,
                type: 'component',
                path: 'quote',
                subgraph: null
            }];

            const diagram = generateMermaid(routes);
            expect(diagram).toContain('#quot;');
            expect(diagram).not.toContain('"Quote"');
        });
    });

    describe('JSON Comment Stripping Regex', () => {
        it('should strip single line comments', () => {
            const input = `{
                "key": "value", // comment
                "foo": "bar"
            }`;
            expect(JSON.parse(stripJsonComments(input))).toEqual({ key: 'value', foo: 'bar' });
        });

        it('should strip block comments', () => {
            const input = `{
                /* comment */
                "key": "value"
            }`;
            expect(JSON.parse(stripJsonComments(input))).toEqual({ key: 'value' });
        });

        it('should NOT strip comments inside strings (URL with //)', () => {
            const input = `{
                "url": "http://example.com/api"
            }`;
            expect(JSON.parse(stripJsonComments(input))).toEqual({ url: 'http://example.com/api' });
        });

        it('should NOT strip block comments inside strings', () => {
            const input = `{
                "text": "This is /* not a comment */"
            }`;
            expect(JSON.parse(stripJsonComments(input))).toEqual({ text: 'This is /* not a comment */' });
        });

        it('should handle escaped quotes in strings', () => {
            const input = `{
                "text": "This is \\"quoted\\" text // not a comment"
            }`;
            expect(JSON.parse(stripJsonComments(input))).toEqual({ text: 'This is "quoted" text // not a comment' });
        });
    });

    describe('AST Parsing vs Regex (Code Injection Prevention)', () => {
        let consoleSpy;

        beforeEach(() => {
            consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it('should resolve component path from real import', () => {
             const routes = [{
                component: 'RealComponent',
                parent: 'Root',
                lazy: false,
                type: 'component',
                path: 'real'
            }];
            const fileContent = `
                import { RealComponent } from './real';
            `;
            const resolved = resolveComponents(routes, fileContent);
            expect(resolved).toHaveLength(1);
            expect(resolved[0].loadComponent).toContain('real');
        });

        it('should NOT resolve component path from string (false positive)', () => {
            const routes = [{
                component: 'FakeComponent',
                parent: 'Root',
                lazy: false,
                type: 'component',
                path: 'fake'
            }];
            // This mimics an import inside a string
            const fileContent = `
                const s = "import { FakeComponent } from './fake'";
            `;
            const resolved = resolveComponents(routes, fileContent);

            // With vulnerable regex, this WOULD resolve.
            // We want it to NOT resolve.
            expect(resolved).toHaveLength(0);
        });

         it('should NOT resolve component path from comment (false positive)', () => {
            const routes = [{
                component: 'CommentedComponent',
                parent: 'Root',
                lazy: false,
                type: 'component',
                path: 'comment'
            }];
            const fileContent = `
                // import { CommentedComponent } from './comment';
            `;
            const resolved = resolveComponents(routes, fileContent);
            expect(resolved).toHaveLength(0);
        });
    });

    describe('AST Import Extraction (Comment Injection Prevention)', () => {
        it('should correctly extract imports from valid code', () => {
            const source = `
                import { A } from './a';
                export { B } from './b';
            `;
            const imports = getImportsAndExports(source);
            expect(imports).toContain('./a');
            expect(imports).toContain('./b');
        });

        it('should NOT extract imports from comments', () => {
            const source = `
                // import { Secret } from '/etc/passwd';
                /* import { Secret } from '/etc/shadow'; */
            `;
            const imports = getImportsAndExports(source);
            expect(imports).toHaveLength(0);
        });

        it('should NOT extract imports from strings', () => {
            const source = `
                const x = "import { Secret } from '/etc/passwd'";
            `;
            const imports = getImportsAndExports(source);
            expect(imports).toHaveLength(0);
        });
    });
});
