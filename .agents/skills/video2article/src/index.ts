#!/usr/bin/env bun
import { setupCLI } from './cli';

const program = setupCLI();
program.parse(process.argv);
