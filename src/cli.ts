#!/usr/bin/env node
import { realDeps, run } from './run.ts';

process.exitCode = run(process.argv.slice(2), realDeps());
