
import { resolveComponents } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';

describe('Security Probe Prevention', () => {
    let tempDir;
    let outsideDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
        process.env.INIT_CWD = tempDir;
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.rmSync(outsideDir, { recursive: true, force: true });
    });

    it('should NOT probe for file existence outside project root', () => {
        const relativePath = path.relative(tempDir, outsideDir);
        // maliciousPath will look like "../outside-XXXXXX/secret"
        const maliciousPath = path.join(relativePath, 'secret');

        const routes = [{
            loadChildren: maliciousPath,
            path: 'secret',
            componentName: 'Secret',
            parent: 'Root'
        }];

        const existsSyncSpy = jest.spyOn(fs, 'existsSync');

        // Suppress console.warn during test
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            resolveComponents(routes, '');
        } catch (e) {
            // ignore
        }

        // The exact path checked would be path.join(tempDir, maliciousPath) + ".ts" OR just the path
        const targetPath = path.resolve(tempDir, maliciousPath);

        // Assert that we did NOT attempt to check existence of the outside file
        // If vulnerable, this expectation will fail because it WAS called
        expect(existsSyncSpy).not.toHaveBeenCalledWith(expect.stringContaining('secret'));
        expect(existsSyncSpy).not.toHaveBeenCalledWith(targetPath);
        expect(existsSyncSpy).not.toHaveBeenCalledWith(targetPath + '.ts');

        warnSpy.mockRestore();
        existsSyncSpy.mockRestore();
    });
});
