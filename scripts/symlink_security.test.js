
import { isSafePath } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';

describe('Symlink Security', () => {
    let tempDir;
    let outsideDir;
    let secretFile;
    let symlinkPath;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
        secretFile = path.join(outsideDir, 'secret.txt');
        fs.writeFileSync(secretFile, 'secret content');

        symlinkPath = path.join(tempDir, 'link_to_secret');
        try {
            fs.symlinkSync(secretFile, symlinkPath);
        } catch (e) {
            console.warn("Skipping symlink creation (likely permission issue or OS restriction)");
        }

        process.env.INIT_CWD = tempDir;
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.rmSync(outsideDir, { recursive: true, force: true });
        } catch (e) {}
    });

    it('should deny access if path is a symlink to outside directory', () => {
        if (!fs.existsSync(symlinkPath)) {
            // Skip test if symlink creation failed
            return;
        }

        // Current vulnerable implementation returns true (safe)
        // Fixed implementation should return false (unsafe)
        const safe = isSafePath(symlinkPath, tempDir);
        expect(safe).toBe(false);
    });
});
