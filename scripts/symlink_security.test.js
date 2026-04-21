
import { isSafePath } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';

describe('Symlink Path Traversal', () => {
    let tempDir;
    let outsideDir;
    let secretFile;
    let symlinkPath;

    beforeEach(() => {
        // Create a temp project directory
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));

        // Create a directory outside the project
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));

        // Create a secret file outside
        secretFile = path.join(outsideDir, 'secret.txt');
        fs.writeFileSync(secretFile, 'secret content');

        // Create a symlink inside the project pointing to the secret file
        symlinkPath = path.join(tempDir, 'link-to-secret.txt');
        try {
            fs.symlinkSync(secretFile, symlinkPath);
        } catch (err) {
            if (err.code === 'EPERM') {
                console.warn('Skipping symlink test due to lack of permissions');
                return;
            }
            throw err;
        }
    });

    afterEach(() => {
        try {
            if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
            if (outsideDir) fs.rmSync(outsideDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Error cleaning up', e);
        }
    });

    it('should return false for a symlink pointing outside the base path', () => {
        if (!fs.existsSync(symlinkPath)) return; // Skip if symlink creation failed

        // logical path is inside tempDir
        // physical path is outside

        const isSafe = isSafePath(symlinkPath, tempDir);

        // We expect it to be UNSAFE (false)
        expect(isSafe).toBe(false);
    });
});
