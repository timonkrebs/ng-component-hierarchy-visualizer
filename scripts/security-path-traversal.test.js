
import fs from 'node:fs';
import path from 'path';
import { main } from './main.helper.js';

const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-data-security-'));
const secretFile = path.join(tempDir, 'secret.txt');
const projectDir = path.join(tempDir, 'project');
const routesFile = path.join(projectDir, 'app.routes.ts');

beforeAll(() => {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(secretFile, 'secret content');
    fs.writeFileSync(routesFile, 'export const routes = [];');
});

afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Security Path Traversal', () => {
    it('should prevent reading files outside of base path', () => {
        const args = {
            basePath: projectDir,
            routesFilePath: '../secret.txt',
            withServices: false,
            withNestedDependencies: false
        };

        expect(() => {
            main(args);
        }).toThrow(/Path traversal detected/);
    });

    it('should allow reading files inside base path', () => {
         const args = {
            basePath: projectDir,
            routesFilePath: 'app.routes.ts',
            withServices: false,
            withNestedDependencies: false
        };

        expect(() => {
            main(args);
        }).not.toThrow();
    });
});
