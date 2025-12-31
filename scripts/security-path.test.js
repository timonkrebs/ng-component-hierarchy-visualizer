
import { jest } from '@jest/globals';
import fs from 'node:fs'; // This import will be the mocked one
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

// We need to import main AFTER mocking fs, because main.helper.js imports 'node:fs'
const { main } = await import('./main.helper.js');
const mockFs = await import('node:fs');

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

        mockFs.default.readFileSync.mockImplementation(() => 'content');
        mockFs.readFileSync.mockImplementation(() => 'content');

        expect(() => {
             main(args);
        }).toThrow(/Path traversal detected/);
    });

    it('should NOT allow accessing sibling directories (partial path traversal)', () => {
        // If base is /app/project
        // /app/project_secret is a sibling but starts with /app/project
        // We want to prevent access to /app/project_secret

        const siblingPath = '../project_secret/config.json';
        const args = {
            basePath: basePath,
            routesFilePath: siblingPath,
            withServices: false,
            withNestedDependencies: false
        };

        mockFs.default.readFileSync.mockImplementation(() => 'content');
        mockFs.readFileSync.mockImplementation(() => 'content');

        expect(() => {
             main(args);
        }).toThrow(/Path traversal detected/);
    });

    it('should allow accessing files inside nested directories', () => {
        const safePath = 'src/app/app.routes.ts';
        const args = {
            basePath: basePath,
            routesFilePath: safePath,
            withServices: false,
            withNestedDependencies: false
        };

        mockFs.default.readFileSync.mockReturnValue('export const routes = [];');
        mockFs.readFileSync.mockReturnValue('export const routes = [];');

        // We expect this NOT to throw
        main(args);

        expect(mockFs.default.readFileSync).toHaveBeenCalled();
    });
});
