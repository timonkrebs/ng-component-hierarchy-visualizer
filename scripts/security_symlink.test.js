
import { isSafePath } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';

describe('Symlink Path Traversal Prevention', () => {
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
        fs.writeFileSync(secretFile, 'secret data');

        // Create a symlink inside the project pointing to the secret file
        symlinkPath = path.join(tempDir, 'evil_link');
        try {
            fs.symlinkSync(secretFile, symlinkPath);
        } catch (e) {
            // On some systems/permissions this might fail, but let's try
            console.warn('Could not create symlink:', e);
        }
    });

    afterEach(() => {
        try {
            fs.unlinkSync(symlinkPath);
        } catch {}
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.rmSync(outsideDir, { recursive: true, force: true });
    });

    it('should deny access to symlinked file outside root', () => {
        // If symlink creation failed, skip
        if (!fs.existsSync(symlinkPath)) {
            console.warn('Skipping test as symlink could not be created');
            return;
        }

        const result = isSafePath(symlinkPath, tempDir);

        // We expect this to be FALSE (secure)
        expect(result).toBe(false);
    });
});
