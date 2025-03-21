import { generateMermaid, main } from './main.helper';
import { extractRoutesFromTS } from './route.helper.js';
import { handleRoutePaths, resolveComponents } from './component.helper.js';
import { addServices } from './service.helper.js';

describe('extractRoutesFromTS', () => {
    it('should extract routes from TypeScript content', () => {
        const fileContent = `
            const x = [
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
        const flatRoutes = handleRoutePaths(nestedRoutes);
        expect(flatRoutes).toEqual(nestedRoutes);
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
    it('should resolve compact components from routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/ngx-admin",
            routesFilePath: 'app-routing.compact.module.ts',
            withServices: true
        });
        expect(components).toMatchSnapshot();
    });
    
    it('should resolve provideRouter components from routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/ngx-admin",
            routesFilePath: 'app-routing.provideRouter.module.ts',
            withServices: true
        });
        expect(components).toMatchSnapshot();
    });

    it('should resolve components from routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/ngx-admin",
            routesFilePath: 'app-routing.module.ts',
            withServices: true
        });
        expect(components).toMatchSnapshot();
    });

    it('should resolve template components from routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/ngx-admin",
            routesFilePath: 'app-routing.module.ts',
            withServices: true,
            withNestedDependencies: true
        });
        expect(components).toMatchSnapshot();
    });
});

describe('generateLazyComponents', () => {
    it('should resolve satisfy components from routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/real-world",
            routesFilePath: 'app.routes.satisfies.ts'
        });
        expect(components).toMatchSnapshot();
    });

    it('should resolve components from routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/real-world",
            routesFilePath: 'app.routes.ts',
            withServices: true
        });
        expect(components).toMatchSnapshot();
    });

    it('should resolve template components from routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/real-world",
            routesFilePath: 'app.routes.ts',
            withServices: true,
            withNestedDependencies: true
        });
        expect(components).toMatchSnapshot();
    });

    it('should resolve template components inspired from real routes', () => {
        const components = main({
            basePath: "./test-data/route-definitions/real-world",
            routesFilePath: 'app.realworldroutes.ts',
            withServices: true,
            withNestedDependencies: true
        });
        expect(components).toMatchSnapshot();
    });
});