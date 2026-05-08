#!/usr/bin/env bun

import { parseArgs } from 'util'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: 'string', default: '3847' },
    'cli-path': { type: 'string' },
    'no-open': { type: 'boolean', default: false },
    config: { type: 'string' },
    debug: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
})

if (values.version) {
  console.log('vibecode-studio v0.1.0')
  process.exit(0)
}

if (values.help) {
  console.log(`
  Vibecode Studio v0.1.0

  Usage: vibecode-studio [options]

  Options:
    --port PORT          Server port (default: 3847)
    --cli-path PATH      Path to vibecode-cli binary
    --no-open            Don't auto-open browser
    --config PATH        Custom config file path
    --debug              Enable debug logging
    --version            Show version
    --help               Show help
`)
  process.exit(0)
}

process.env.VS_PORT = values.port ?? '3847'
if (values['cli-path']) process.env.VS_CLI_PATH = values['cli-path']
if (values['no-open']) process.env.VS_NO_OPEN = '1'
if (values.config) process.env.VS_CONFIG_PATH = values.config
if (values.debug) process.env.VS_DEBUG = '1'

await import('../server/index.ts')
