import { ExecutorContext, joinPathFragments, workspaceRoot } from '@nx/devkit';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'node:util';
import { JestExecutorSchema } from './schema';
import { join } from 'node:path';
import * as glob from 'fast-glob';
// this import has changed in lasted angular repo,
// and will probs need some backwards compat for older versions
import { buildEsbuildBrowserInternal } from '@angular-devkit/build-angular/src/builders/browser-esbuild';
import type { BuilderContext } from '@angular-devkit/architect';
import type { BrowserEsbuildOptions } from '@angular-devkit/build-angular/src/builders/browser-esbuild/options';
import { writeFileSync } from 'fs';

const execFile = promisify(execFileCb);
export default async function runExecutor(
  // TODO(caleb): have extra options to pass to jest cli such as cache control and watch mode
  options: JestExecutorSchema,
  context: ExecutorContext
) {
  const testOut = joinPathFragments('dist', 'test-out', context.projectName);

  const testFiles = new Set(
    // TODO(caleb): make this configurable
    (
      await glob('**/*.spec.ts', {
        cwd: workspaceRoot,
        ignore: ['node_modules'],
      })
    ).flat()
  );

  testFiles.add(join(__dirname, 'jest-global.mjs'));
  testFiles.add(join(__dirname, 'init-test-bed.mjs'));

  const ngBuildOptions: BrowserEsbuildOptions = {
    entryPoints: testFiles,
    tsConfig: options.tsConfig,
    polyfills: ['zone.js', 'zone.js/testing'],
    outputPath: testOut,
    aot: false,
    index: false,
    outputHashing: 'none' as any,
    outExtension: 'mjs',
    optimization: false,
    sourceMap: {
      scripts: true,
      styles: false,
      vendor: false,
    },
    deleteOutputPath: true,
  };

  const ngBuilderContext: BuilderContext = {
    ...(context as any),
    workspaceRoot: context.root,
    logger: console,
    target: {
      project: context.projectName,
    },
    getProjectMetadata: () =>
      context.projectGraph.nodes[context.projectName].data,
  };

  try {
    for await (const _ of buildEsbuildBrowserInternal(
      ngBuildOptions,
      ngBuilderContext
    )) {
      // do nothing
    }
  } catch (e) {
    return { success: false, error: e };
  }

  // TODO(caleb): maybe copy a user config file if it exists, but how to merge with required settings?
  // have to use a config file and then tell jest only to use that project since jest will read the project
  // from the root level jest.config.ts which will not contain this built project in dist/
  writeFileSync(
    join(testOut, 'jest.config.mjs'),
    `export default {
  displayName: '${context.projectName}',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/**/*.mjs'],
    // Load polyfills and initialize the environment before executing each test file.
    // IMPORTANT: Order matters here.
    // First, we execute 'jest-global.mjs' to initialize the 'jest' global variable.
    // Second, we execute user polyfills, including 'zone.js' and 'zone.js/testing'. This is dependent on the Jest global so it can patch
    // the environment for fake async to work correctly.
    // Third, we initialize 'TestBed'. This is dependent on fake async being set up correctly beforehand.
  setupFilesAfterEnv: [
    "<rootDir>/jest-global.mjs",
    "<rootDir>/polyfills.mjs",
    "<rootDir>/init-test-bed.mjs"
  ],
  testPathIgnorePatterns: [
    "<rootDir>/jest-global\\.mjs",
    "<rootDir>/polyfills\\.mjs",
    "<rootDir>/init-test-bed\\.mjs",
    "<rootDir>/jest.config*",
    // Skip shared chunks, as they are not entry points to tests.
    "<rootDir>/chunk-.*\\.mjs"
  ]
};
`
  );

  const jest = require.resolve('jest/bin/jest');

  const jestProc = execFile(
    process.execPath,
    [
      '--experimental-vm-modules',
      jest,
      // if we don't pass the specific project, jest will read the existing root level config
      // and error that the project doesn't exist
      `--projects="${testOut}/jest.config.mjs"`,
    ],
    {
      cwd: context.root,
      shell: true,
    }
  );

  // Stream test output to the terminal.
  jestProc.child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  jestProc.child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
  });
  await jestProc;
  return { success: true };
}
