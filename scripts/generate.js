#!/usr/bin/env node
import path from 'path';
import { main } from './helper.js'; // Adjust the path as needed

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

    return args;
}


console.log(main(parseArguments(process.argv)));

