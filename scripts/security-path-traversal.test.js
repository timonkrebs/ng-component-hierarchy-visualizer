
import { jest } from '@jest/globals';
import path from 'path';

// Mock fs
const readFileSyncMock = jest.fn();
const mockFs = {
    default: {
        readFileSync: readFileSyncMock,
        existsSync: jest.fn(() => true),
        writeFile: jest.fn(),
    },
    readFileSync: readFileSyncMock,
    existsSync: jest.fn(() => true),
    writeFile: jest.fn(),
};

jest.unstable_mockModule('node:fs', () => mockFs);
jest.unstable_mockModule('fs', () => mockFs); // Mock both just in case

const fsMock = await import('node:fs');
const { main } = await import('./main.helper.js');

describe('Path Traversal Vulnerability', () => {
    beforeEach(() => {
        readFileSyncMock.mockReset();
    });

    it('should throw error when reading files outside basePath', () => {
        const basePath = '/safe/app';
        const sensitiveFile = '../../etc/passwd';
        const args = {
            basePath: basePath,
            routesFilePath: sensitiveFile,
            withServices: false,
            withNestedDependencies: false
        };

        // Mock readFileSync to return valid content
        readFileSyncMock.mockReturnValue("export const routes = [];");

        // Expect main to throw a security error
        expect(() => main(args)).toThrow('Security Error: Path traversal detected. Access denied.');

        // Verify readFileSync was NOT called
        expect(readFileSyncMock).not.toHaveBeenCalled();
    });

    it('should throw error for partial path match bypass', () => {
        // Example: basePath = /safe/app
        // Attacker target = /safe/app_secret
        // simple startsWith check would allow this because /safe/app is a prefix of /safe/app_secret

        const basePath = '/safe/app';
        const attackFile = '../app_secret/secret.txt';
        // resolved path: /safe/app_secret/secret.txt

        const args = {
            basePath: basePath,
            routesFilePath: attackFile,
            withServices: false,
            withNestedDependencies: false
        };

        readFileSyncMock.mockReturnValue("export const routes = [];");

        expect(() => main(args)).toThrow('Security Error: Path traversal detected. Access denied.');
        expect(readFileSyncMock).not.toHaveBeenCalled();
    });

    it('should allow reading files inside basePath', () => {
        const basePath = '/safe/app';
        const validFile = 'app.routes.ts';
        const args = {
            basePath: basePath,
            routesFilePath: validFile,
            withServices: false,
            withNestedDependencies: false
        };

        readFileSyncMock.mockReturnValue("export const routes = [];");

        try {
            main(args);
        } catch(e) {
            // might fail downstream, we just check read call
        }

        expect(readFileSyncMock).toHaveBeenCalledWith(
            path.resolve(basePath, validFile),
            'utf-8'
        );
    });
});
