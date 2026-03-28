
import { isSafePath } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';

describe('Symlink Security', () => {
    let tempDir;
    let outsideDir;
    let secretFile;
    let symlinkPath;

    beforeEach(() => {
        // Create project root
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));

        // Create outside directory
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));

        // Create a secret file outside
        secretFile = path.join(outsideDir, 'secret.txt');
        fs.writeFileSync(secretFile, 'secret data');

        // Create a symlink inside project pointing to outside file
        // tempDir/link -> outsideDir/secret.txt
        symlinkPath = path.join(tempDir, 'link');
        try {
            fs.symlinkSync(secretFile, symlinkPath);
        } catch (e) {
            // If symlinks fail (e.g. Windows permissions), we skip the test or mock
            // But for this environment, we expect it to work.
            console.warn('Symlink creation failed:', e);
        }
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.rmSync(outsideDir, { recursive: true, force: true });
        } catch (e) {}
    });

    it('should NOT return true for a symlink pointing outside the project root', () => {
        if (!fs.existsSync(symlinkPath)) {
            console.warn('Skipping test because symlink could not be created');
            return;
        }

        // The path we are checking is the symlink inside the project
        // path.resolve(tempDir, 'link') -> .../project/link
        // This starts with project root, so string check passes.
        // But realpath is .../outside/secret.txt, so it should fail.

        const isSafe = isSafePath(symlinkPath, tempDir);
        expect(isSafe).toBe(false);
    });
});
