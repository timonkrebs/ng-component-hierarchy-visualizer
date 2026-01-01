
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'path';

// Mock fs and path to simulate filesystem operations
jest.unstable_mockModule('node:fs', () => ({
    readFileSync: jest.fn(),
    existsSync: jest.fn(),
    lstatSync: jest.fn(),
    default: {
        readFileSync: jest.fn(),
        existsSync: jest.fn(),
        lstatSync: jest.fn(),
    }
}));

const mockFs = await import('node:fs');

// Dynamic import of the module under test
const { main } = await import('./main.helper.js');

describe('Path Traversal Security', () => {
    const basePath = '/app/project';

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.INIT_CWD = basePath;
    });

    it('should NOT allow accessing files outside the base path using relative paths', () => {
        const unsafePath = '../../etc/passwd';
        const args = {
            basePath: basePath,
            routesFilePath: unsafePath,
            withServices: false,
            withNestedDependencies: false
        };

        const readFileSyncMock = mockFs.default.readFileSync;

        try {
            main(args);
        } catch (e) {
             // Ignore errors
        }

        const calledPath = readFileSyncMock.mock.calls[0]?.[0];

        if (calledPath && calledPath.includes('etc/passwd')) {
            throw new Error('Path traversal vulnerability detected! Code accessed ' + calledPath);
        }
    });

    it('should NOT allow partial path traversal', () => {
        // Example: basePath is /app/project
        // Attacker tries to access /app/project-secret/data
        const partialPath = '../project-secret/data';
        const args = {
            basePath: basePath,
            routesFilePath: partialPath,
            withServices: false,
            withNestedDependencies: false
        };

         const readFileSyncMock = mockFs.default.readFileSync;

        try {
            main(args);
        } catch (e) {
             // Ignore errors
        }

        const calledPath = readFileSyncMock.mock.calls[0]?.[0];
         if (calledPath && calledPath.includes('project-secret')) {
            throw new Error('Partial path traversal vulnerability detected! Code accessed ' + calledPath);
        }
    });
});
