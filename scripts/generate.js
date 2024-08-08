#!/usr/bin/env node
import fs from 'node:fs';
import path from 'path';
import { main } from './main.helper.js'; // Adjust the path as needed

const parseArguments = (argv) => {
    const args = {
        routesFilePath: "app.routes.ts",
        basePath: process.env.INIT_CWD ?? process.cwd(),
        withServices: false,
        withNestedTemplateElements: false
    };

    for (let index = 1; index < argv.length; index++) {
        const element = argv[index];
        if ("--withservices" === element?.trim().toLowerCase()) {
            args.withServices = true;
        } else if ("--withnestedtemplateelements" === element?.trim().toLowerCase()) {
            args.withNestedTemplateElements = true;
        } else if (element?.trim().toLowerCase().startsWith("--basepath=")) {
            args.basePath = path.join(process.env.INIT_CWD ?? process.cwd(), element?.trim().slice(11));
        } else {
            args.routesFilePath = element?.trim();
        }
    }

    if (fs.existsSync(path.join(process.env.INIT_CWD ?? process.cwd(), 'tsconfig.json'))) {
        args.pathAlias = JSON.parse(fs.readFileSync(path.join(process.env.INIT_CWD ?? process.cwd(), 'tsconfig.json'), 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')).compilerOptions?.paths;
    } else if (fs.existsSync(path.join(process.env.INIT_CWD ?? process.cwd(), 'tsconfig.base.json'))) {
        args.pathAlias = JSON.parse(fs.readFileSync(path.join(process.env.INIT_CWD ?? process.cwd(), 'tsconfig.base.json'), 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')).compilerOptions?.paths;
    }

    return args;
}


console.log(main(parseArguments(process.argv)));

