
import { jest } from '@jest/globals';
import path from 'path';

describe('Template Helper Security Tests', () => {
    let addTemplateElements;
    let fsMock;

    beforeEach(async () => {
        // Mock fs
        fsMock = {
            existsSync: jest.fn(),
            readFileSync: jest.fn(),
        };

        await jest.unstable_mockModule('node:fs', () => ({
            default: fsMock,
            existsSync: fsMock.existsSync,
            readFileSync: fsMock.readFileSync,
        }));

        // Dynamic import after mocking
        const module = await import('./template.helper.js');
        addTemplateElements = module.addTemplateElements;
    });

    afterEach(() => {
        jest.resetModules();
        jest.restoreAllMocks();
    });

    it('should correctly identify exported component class and ignore class declarations inside string literals', async () => {
        const fileContent = `
            const s = "export class FakeComponent {}";
            export class RealComponent {}
        `;

        // Setup mocks
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue(fileContent);

        const elements = [{
            type: 'component',
            loadComponent: 'path/to/component',
            componentName: 'OriginalName',
            lazy: false
        }];

        process.env.INIT_CWD = '/root';

        const result = addTemplateElements(elements, false);

        // The parser should ignore "FakeComponent" inside the string and correctly identify "RealComponent"
        expect(result[0].componentName).toBe('RealComponent');
    });
});
