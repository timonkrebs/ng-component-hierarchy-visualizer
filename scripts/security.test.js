
import { generateMermaid } from './main.helper.js';
import { stripJsonComments } from './json.helper.js';

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
});
