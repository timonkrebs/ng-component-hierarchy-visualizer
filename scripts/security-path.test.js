
import { jest } from '@jest/globals';
import path from 'path';

// Mock fs
jest.unstable_mockModule('node:fs', () => ({
    default: {
        readFileSync: jest.fn(),
        writeFile: jest.fn(),
        existsSync: jest.fn(),
        lstatSync: jest.fn(),
    },
    readFileSync: jest.fn(),
    writeFile: jest.fn(),
    existsSync: jest.fn(),
    lstatSync: jest.fn(),
}));

// Mock other helpers to avoid side effects and deep dependency chains
jest.unstable_mockModule('./route.helper.js', () => ({
    extractRoutesFromTS: jest.fn(() => []),
    findImportPath: jest.fn(),
    getImportsAndExports: jest.fn(() => ({ imports: [], exports: [] })),
}));

jest.unstable_mockModule('./component.helper.js', () => ({
    handleRoutePaths: jest.fn(r => r),
    resolveComponents: jest.fn(() => []),
    setPathAliases: jest.fn(),
}));

jest.unstable_mockModule('./template.helper.js', () => ({
    addTemplateElements: jest.fn(e => e),
}));

jest.unstable_mockModule('./service.helper.js', () => ({
    addServices: jest.fn(e => e),
    setServicePathAliases: jest.fn(),
}));

const fs = await import('node:fs');
const { main } = await import('./main.helper.js');

describe('Path Traversal Check', () => {
    it('should throw error if routesFilePath traverses outside basePath', () => {
        const cwd = process.cwd();
        const basePath = path.join(cwd, 'safe-zone');
        const maliciousFile = '../secret.txt';

        fs.default.readFileSync.mockReturnValue('const routes = [];');

        expect(() => {
            main({
                basePath: basePath,
                routesFilePath: maliciousFile,
                withServices: false,
                withNestedDependencies: false
            });
        }).toThrow(/Security Error: Path traversal detected/);

        expect(fs.default.readFileSync).not.toHaveBeenCalled();
    });
});
