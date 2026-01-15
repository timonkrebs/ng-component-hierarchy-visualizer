
import { jest } from '@jest/globals';
import path from 'path';
import fs from 'node:fs';
import { resolveComponents } from './component.helper.js';

describe('Path Traversal Probing', () => {
    let existsSyncSpy;

    beforeEach(() => {
        existsSyncSpy = jest.spyOn(fs, 'existsSync');
        // Set CWD to a dummy value
        process.env.INIT_CWD = '/app';
    });

    afterEach(() => {
        existsSyncSpy.mockRestore();
    });

    it('should NOT probe file system with unsafe paths', () => {
        const routes = [{
            loadChildren: '../../../../etc/passwd',
            path: 'hack',
            componentName: 'Hack',
            parent: 'Root'
        }];

        // We expect it to FAIL securely
        try {
            resolveComponents(routes, '');
        } catch (e) {}

        // If the vulnerability is fixed, fs.existsSync should NOT be called with unsafe paths
        // because isSafePath check prevents it.
        expect(existsSyncSpy).not.toHaveBeenCalledWith(expect.stringContaining('passwd'));
    });
});
