#!/usr/bin/env node

import process from "node:process";
import { main } from "./cli/main.js";

process.exitCode = await main();
