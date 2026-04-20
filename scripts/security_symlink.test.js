import { isSafePath } from './component.helper.js';
import fs from 'node:fs';
import path from 'path';
import os from 'os';

describe('Symlink Path Traversal Security', () => {
    let tempDir;
    let outsideDir;
    let secretFile;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));
        outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
        secretFile = path.join(outsideDir, 'secret.txt');
        fs.writeFileSync(secretFile, 'secret content');
        process.env.INIT_CWD = tempDir;
    });

    afterEach(() => {
        // cleanup
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.rmSync(outsideDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Cleanup failed', e);
        }
    });

    it('should reject a symlink pointing outside the project root', () => {
        const linkPath = path.join(tempDir, 'unsafe-link');
        try {
            fs.symlinkSync(secretFile, linkPath);
        } catch (e) {
            // Skip test if symlinks not supported (e.g. some Windows envs without admin)
            console.warn('Skipping symlink test due to permission error:', e);
            return;
        }

        expect(isSafePath(linkPath, tempDir)).toBe(false);
    });

    it('should allow a symlink pointing inside the project root', () => {
        const innerFile = path.join(tempDir, 'inner.txt');
        fs.writeFileSync(innerFile, 'inner content');

        const linkPath = path.join(tempDir, 'safe-link');
        try {
            fs.symlinkSync(innerFile, linkPath);
        } catch (e) {
            console.warn('Skipping symlink test due to permission error:', e);
            return;
        }

        expect(isSafePath(linkPath, tempDir)).toBe(true);
    });

    it('should allow a regular file inside the project root', () => {
        const regularFile = path.join(tempDir, 'regular.txt');
        fs.writeFileSync(regularFile, 'content');
        expect(isSafePath(regularFile, tempDir)).toBe(true);
    });

    it('should reject a regular file outside the project root (logical check)', () => {
        const outsideFile = path.join(outsideDir, 'other.txt');
        expect(isSafePath(outsideFile, tempDir)).toBe(false);
    });

    it('should allow a non-existent file path that is logically inside', () => {
        // This is important for "creating" new files
        const newFile = path.join(tempDir, 'new-file.txt');
        expect(isSafePath(newFile, tempDir)).toBe(true);
    });
});
