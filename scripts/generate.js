#!/usr/bin/env node
import { main } from './helper'; // Adjust the path as needed

console.log(main(process.argv[2] ?? DEFAULT_ROUTES_FILE));
