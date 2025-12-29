
import { main } from './main.helper.js';
import path from 'path';

describe('Path Traversal Prevention', () => {
    it('should throw error when accessing files outside basePath', () => {
         const basePath = path.resolve('./test-data/project');
         // We don't need the file to exist because we check the path resolution BEFORE reading
         const unsafePath = '../secret.txt';

         expect(() => {
             main({
                 basePath: basePath,
                 routesFilePath: unsafePath
             });
         }).toThrow(/Security Error: Path traversal detected/);
    });
});
