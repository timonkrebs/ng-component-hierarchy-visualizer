
import { isSafePath } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';

describe('Symlink Security Check', () => {
    let tempDir;
    let outsideDir;
    let secretFile;
    let symlinkPath;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
        secretFile = path.join(outsideDir, 'secret.txt');
        fs.writeFileSync(secretFile, 'secret content');

        // Create a symlink inside tempDir pointing to secretFile
        symlinkPath = path.join(tempDir, 'link-to-secret.txt');
        try {
            fs.symlinkSync(secretFile, symlinkPath);
        } catch (e) {
            // potential permission issue on Windows, skip if needed but we are in linux env usually
            console.warn("Could not create symlink", e);
        }
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.rmSync(outsideDir, { recursive: true, force: true });
    });

    it('should NOT allow access to symlinked file outside root', () => {
        if (fs.existsSync(symlinkPath)) {
             expect(isSafePath(symlinkPath, tempDir)).toBe(false);
        }
    });
});
