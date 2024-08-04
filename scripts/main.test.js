import { generateMermaid, main } from './main.helper';
import { extractRoutesFromTS } from './route.helper.js';
import { flattenRoutes, resolveComponents } from './component.helper.js';
import { addServices } from './service.helper.js';

describe('extractRoutesFromTS', () => {
    it('should extract routes from TypeScript content', () => {
        const fileContent = `
            [
                { path: '', component: HomeComponent },
                { path: 'about', component: AboutComponent }
            ]
        `;
        const expectedRoutes = [
            { path: '', component: 'HomeComponent', parent: 'Root' },
            { path: 'about', component: 'AboutComponent', parent: 'Root' }
        ];
        const routes = extractRoutesFromTS(fileContent);
        expect(routes).toEqual(expectedRoutes);
    });
});

describe('flattenRoutes', () => {
    it('should flatten nested routes', () => {
        const nestedRoutes = [
            { path: '', component: 'HomeComponent', children: [
                { path: 'child', component: 'ChildComponent' }
            ]}
        ];
        const expectedRoutes = [
            { path: 'child', component: 'ChildComponent' },
            { path: '', component: 'HomeComponent', "children": null }
        ];
        const flatRoutes = flattenRoutes(nestedRoutes);
        expect(flatRoutes).toEqual(expectedRoutes);
    });
});

describe('resolveComponents', () => {
    it('should resolve components from routes', () => {
        process.env.INIT_CWD = "."
        const routes = [
            { path: '', component: 'HomeComponent' },
            { path: 'lazy', loadComponent: './lazy.component.ts' }
        ];
        const routesFileContent = `
            import { HomeComponent } from './home.component';
            import { LazyComponent } from './lazy.component';
        `;
        const expectedComponents = [
            { path: '', loadComponent: './home.component', componentName: 'HomeComponent', lazy: false, type: 'component' },
            { path: 'lazy', loadComponent: 'lazy.component.ts', lazy: true, type: 'component' }
        ];
        const components = resolveComponents(routes, routesFileContent);
        expect(components).toEqual(expectedComponents);
    });
});

describe('addServices', () => {
    it('should add dependencies to components', () => {
        const components = [
            { path: '', loadComponent: './home.component', componentName: 'HomeComponent', parent: 'AppComponent', lazy: false, type: 'component' }
        ];
        const expectedDependencies = [
            { path: '', loadComponent: './home.component', componentName: 'HomeComponent', parent: 'AppComponent', lazy: false, type: 'component' }
        ];
        const dependencies = addServices(components);
        expect(dependencies).toEqual(expectedDependencies);
    });
});

describe('generateMermaid', () => {
    it('should generate Mermaid diagram from routes', () => {
        const routes = [
            { path: '', componentName: 'HomeComponent', parent: 'AppComponent', type: 'component' }
        ];
        const expectedOutput = `
flowchart LR
AppComponent --o HomeComponent(HomeComponent)
        `.trim();
        expect(generateMermaid(routes)).toEqual(expectedOutput);
    });
});

describe('generateDeepNestedRoutes', () => {
    it('should resolve components from routes', () => {
        const components = main({
            basePath: "./tests/route-definitions/ngx-admin",
            routesFilePath: 'app-routing.module.ts',
            withServices: true
        });
        expect(components).toMatchSnapshot();
    });

    it('should resolve template components from routes', () => {
        const components = main({
            basePath: "./tests/route-definitions/ngx-admin",
            routesFilePath: 'app-routing.module.ts',
            withServices: true,
            withNestedTemplateElements: true
        });
        expect(components).toMatchSnapshot();
    });
});

describe('generateLazyComponents', () => {
    it('should resolve components from routes', () => {
        const components = main({
            basePath: "./tests/route-definitions/real-world",
            routesFilePath: 'app.routes.ts',
            withServices: true
        });
        expect(components).toMatchSnapshot();
    });

    it('should resolve template components from routes', () => {
        const components = main({
            basePath: "./tests/route-definitions/real-world",
            routesFilePath: 'app.routes.ts',
            withServices: true,
            withNestedTemplateElements: true
        });
        expect(components).toMatchSnapshot();
    });
});