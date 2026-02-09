#!/usr/bin/env tsx
import { config } from '../lib/config.js';

console.log('Workspace ID from config:', config.workspaceId);
console.log('Type:', typeof config.workspaceId);
