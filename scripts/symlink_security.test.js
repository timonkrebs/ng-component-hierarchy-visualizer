
import { resolveComponents } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';

describe('Symlink Path Traversal', () => {
    let tempDir;
    let outsideDir;
    let secretFile;
    let symlinkPath;

    beforeEach(() => {
        // Create isolated directories
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));

        // Create a secret file outside the project
        secretFile = path.join(outsideDir, 'secret.ts');
        fs.writeFileSync(secretFile, 'export const routes = []; // SECRET CONTENT');

        // Create a symlink inside the project pointing to the secret file
        // symlink -> ../outside/secret.ts
        symlinkPath = path.join(tempDir, 'unsafe-link.ts');
        try {
            fs.symlinkSync(secretFile, symlinkPath);
        } catch (e) {
            console.warn('Symlink creation failed (platform specific?)', e);
        }

        process.env.INIT_CWD = tempDir;
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.rmSync(outsideDir, { recursive: true, force: true });
        } catch(e) {}
    });

    it('should DETECT and BLOCK access via symlink to outside file', () => {
        // If the vulnerability exists, this test will fail to prevent access
        // We want isSafePath (called inside resolveComponents) to return false/block it.

        // Setup a route that loads the symlink
        const routes = [{
            loadChildren: 'unsafe-link', // matches unsafe-link.ts
            path: 'secret',
            componentName: 'Secret',
            parent: 'Root'
        }];

        // We spy on readFileSync to see if it gets called on our symlink
        // But simpler: resolveComponents logs a warning if access denied.

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const readSpy = jest.spyOn(fs, 'readFileSync');

        resolveComponents(routes, '');

        // If vulnerable:
        // isSafePath returns true.
        // readFileSync IS called.
        // console.warn is NOT called.

        // We assert that we WANT protection:
        // readSpy should NOT be called.
        // console.warn SHOULD be called.

        try {
            expect(readSpy).not.toHaveBeenCalledWith(expect.stringContaining('unsafe-link.ts'), expect.any(String));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Security Warning'));
        } catch (error) {
            // If we are here, it means the assertion failed, confirming vulnerability
            console.log("VULNERABILITY CONFIRMED: Managed to read file via symlink.");
            throw error;
        } finally {
            consoleSpy.mockRestore();
            readSpy.mockRestore();
        }
    });
});
