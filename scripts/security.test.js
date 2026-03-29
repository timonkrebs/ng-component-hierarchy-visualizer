
import { generateMermaid } from './main.helper.js';
import { stripJsonComments } from './json.helper.js';
import { resolveComponents } from './component.helper.js';
import { addServices } from './service.helper.js';
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'path';
import os from 'os';

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

        it('should resolve component path from import with double quotes', () => {
             const routes = [{
                component: 'DoubleQuoteComponent',
                parent: 'Root',
                lazy: false,
                type: 'component',
                path: 'double'
            }];
            const fileContent = `
                import { DoubleQuoteComponent } from "./double";
            `;
            const resolved = resolveComponents(routes, fileContent);
            expect(resolved).toHaveLength(1);
            expect(resolved[0].loadComponent).toContain('double');
        });
    });

    describe('Service Dependency Injection Security', () => {
        let tempDir;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-route-hierarchy-test-'));
            process.env.INIT_CWD = tempDir;
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should NOT detect services in comments (false positive)', () => {
            const componentName = 'my.component';
            const componentPath = path.join(tempDir, componentName + '.ts');

            const fileContent = `
                import { RealService } from './real.service';
                // import { FakeService } from './fake.service';

                export class MyComponent {
                    constructor(private real: RealService) {
                        // private fake: FakeService
                    }
                }
            `;

            fs.writeFileSync(componentPath, fileContent);

            const components = [{
                loadComponent: componentName,
                path: 'my-path',
                componentName: 'MyComponent',
                parent: 'Root'
            }];

            const result = addServices(components);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ componentName: 'RealService', type: 'service' })
            ]));

            expect(result).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ componentName: 'FakeService' })
            ]));
        });

        it('should NOT detect services in strings (false positive)', () => {
            const componentName = 'string.component';
            const componentPath = path.join(tempDir, componentName + '.ts');

            const fileContent = `
                import { RealService } from './real.service';

                export class MyComponent {
                    constructor(private real: RealService) {
                        const s = "constructor(private fake: FakeService)";
                    }

                    method() {
                        const s = "inject(FakeService)";
                    }
                }
            `;

            fs.writeFileSync(componentPath, fileContent);

            const components = [{
                loadComponent: componentName,
                path: 'my-path',
                componentName: 'MyComponent',
                parent: 'Root'
            }];

            const result = addServices(components);

            expect(result).toEqual(expect.arrayContaining([
                 expect.objectContaining({ componentName: 'RealService', type: 'service' })
            ]));

            expect(result).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ componentName: 'FakeService' })
            ]));
        });
    });

    describe('Path Traversal Prevention', () => {
        let tempDir;
        let outsideDir;
        let secretFile;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));
            outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
            secretFile = path.join(outsideDir, 'secret.ts');
            fs.writeFileSync(secretFile, 'export const routes = []; // secret content');

            process.env.INIT_CWD = tempDir;
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.rmSync(outsideDir, { recursive: true, force: true });
        });

        it('should NOT allow reading file outside of project root', () => {
            const relativePath = path.relative(tempDir, secretFile);
            const routePath = relativePath.endsWith('.ts') ? relativePath.slice(0, -3) : relativePath;

            const routes = [{
                loadChildren: routePath,
                path: 'secret',
                componentName: 'Secret',
                parent: 'Root'
            }];

            const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');

            try {
                resolveComponents(routes, '');
            } catch (e) {
                // ignore errors
            }

            expect(readFileSyncSpy).not.toHaveBeenCalledWith(expect.stringContaining('secret.ts'), 'utf-8');
            readFileSyncSpy.mockRestore();
        });
    });

    describe('DoS Prevention (Circular Dependencies)', () => {
        let tempDir;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cycle-test-'));
            process.env.INIT_CWD = tempDir;
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should handle circular dependencies in loadChildren without crashing', () => {
            const moduleAPath = path.join(tempDir, 'moduleA.ts');
            const moduleBPath = path.join(tempDir, 'moduleB.ts');

            // Module A loads Module B
            fs.writeFileSync(moduleAPath, `
                export const routes = [
                    {
                        path: 'b',
                        loadChildren: () => import('./moduleB')
                    }
                ];
            `);

            // Module B loads Module A
            fs.writeFileSync(moduleBPath, `
                export const routes = [
                    {
                        path: 'a',
                        loadChildren: () => import('./moduleA')
                    }
                ];
            `);

            const routes = [{
                path: 'a',
                loadChildren: './moduleA',
                componentName: 'ModuleA',
                parent: 'Root'
            }];

            expect(() => {
                const result = resolveComponents(routes, '');
                // Verify that we got something back and didn't crash
                expect(result.length).toBeGreaterThan(0);
            }).not.toThrow();
        });
    });
});
