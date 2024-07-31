import fs from 'node:fs';
import path from 'path';

export const addTemplateElements = (elements, recursionDepth = 0) => {
    if (recursionDepth > 5) {
        return elements;
    }
    return elements
        .flatMap(loadDependencies);
}


const loadDependencies = (c, recursionDepth) => {
    if (c.type !== 'component' || !c.loadComponent) {
        return [c];
    }
    const cwd = process.env.INIT_CWD ?? process.cwd();
    const p = path.join(cwd, c.loadComponent + ".ts");
    if (!fs.existsSync(p, 'utf-8')) {
        return [c];
    }

    const fileContent = fs.readFileSync(p, 'utf-8');

    const importsRegex = /@Component\([\s\S]*?imports:\s*(\[[^\]]+\])/;
    const match = importsRegex.exec(fileContent);

    if (match) {
        let importsContent = match[1]; // Contains the raw import names

        // Step 2: Wrap each import name with "importName"
        importsContent = importsContent
            .replace(/\b([^,]+)\b/g, '"$1"')
            .replaceAll(/\,(?=\s*?[\}\]])/g, "");

        const json = JSON.parse(importsContent);
        const components = [];
        json.forEach(componentName => {
            const comp = handleComponent(componentName, fileContent, c.componentName, path.relative(cwd, p));
            if (comp) {
                components.push(comp)
            }
        });

        const x = addTemplateElements(components, recursionDepth + 1);
        return [c, ...x];
    }

    return [c];
}

const handleComponent = (componentName, routesFileContent, parent, relativePath = null) => {
    const regex = new RegExp(`import\\s*{\\s*([^}]*\\b${componentName}\\b[^}]*)\\s*}\\s*from\\s*['"]([^'"]+)['"]`);
    const match = routesFileContent.match(regex);
    if (match && match[2] && match[2].startsWith('@angular')) {
        return null;
    } else if (match && match[2]) {
        const cwd = process.env.INIT_CWD ?? process.cwd();
        const modulePath = match[2];
        const loadComponent = relativePath ? path.relative(cwd, path.resolve(cwd, relativePath, modulePath)) : modulePath;
        return { loadComponent, componentName, parent, lazy: false, type: 'import' };
    } else {
        return { loadComponent: null, componentName, parent, lazy: false, type: 'import', skipLoadingDependencies: true };
    }
};