
import { resolveComponents } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';

describe('DoS Vulnerability: Circular Dependencies', () => {
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dos-test-'));
        process.env.INIT_CWD = tempDir;
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should NOT crash due to infinite recursion', () => {
        const route1Path = path.join(tempDir, 'route1.ts');
        const route2Path = path.join(tempDir, 'route2.ts');

        // route1 loads route2
        fs.writeFileSync(route1Path, `
            export const routes = [
                {
                    path: 'to-route2',
                    loadChildren: () => import('./route2').then(m => m.routes)
                }
            ];
        `);

        // route2 loads route1
        fs.writeFileSync(route2Path, `
            export const routes = [
                {
                    path: 'to-route1',
                    loadChildren: () => import('./route1').then(m => m.routes)
                }
            ];
        `);

        // The tool logic seems to expect a certain structure.
        // We start with a route that points to route1.
        const initialRoutes = [{
            loadChildren: 'route1', // Helper expects this to be a path string if manually constructed?
            // Actually, resolveComponents expects 'route.loadChildren' to be the path string found in the file.
            // But here we are seeding the initial call.
            // If we look at 'handleLoadChildren', it uses route.loadChildren to resolve the file.
            path: 'start',
            componentName: 'Start',
            parent: 'Root'
        }];

        // We expect this to throw "RangeError: Maximum call stack size exceeded"
        // If fixed, it should handle it gracefully.
        expect(() => {
            resolveComponents(initialRoutes, '');
        }).not.toThrow();
    });
});
