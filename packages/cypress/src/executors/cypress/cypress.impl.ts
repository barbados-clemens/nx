import { createAsyncIterable } from '@nrwl/js/src/utils/create-async-iterable/create-async-iteratable';
import { fork } from 'child_process';
import {
  ExecutorContext,
  logger,
  parseTargetString,
  readTargetOptions,
  stripIndents,
} from '@nrwl/devkit';
import 'dotenv/config';
import { existsSync, unlinkSync } from 'fs';
import { basename, dirname, join } from 'path';
import { getTempTailwindPath } from '../../utils/ct-helpers';
import { installedCypressVersion } from '../../utils/cypress-version';

const Cypress = require('cypress'); // @NOTE: Importing via ES6 messes the whole test dependencies.

export type Json = { [k: string]: any };

export interface CypressExecutorOptions extends Json {
  cypressConfig: string;
  watch?: boolean;
  tsConfig?: string;
  devServerTargets?: string[];
  headed?: boolean;
  headless?: boolean;
  exit?: boolean;
  key?: string;
  record?: boolean;
  parallel?: boolean;
  baseUrl?: string;
  browser?: string;
  env?: Record<string, string>;
  spec?: string;
  copyFiles?: string;
  ciBuildId?: string | number;
  group?: string;
  ignoreTestFiles?: string;
  reporter?: string;
  reporterOptions?: string;
  skipServe?: boolean;
  testingType?: 'component' | 'e2e';
  tag?: string;
}

interface NormalizedCypressExecutorOptions extends CypressExecutorOptions {
  ctTailwindPath?: string;
}
export default async function cypressExecutor(
  options: CypressExecutorOptions,
  context: ExecutorContext
) {
  options = normalizeOptions(options, context);
  // this is used by cypress component testing presets to build the executor contexts with the correct configuration options.
  process.env.NX_CYPRESS_TARGET_CONFIGURATION = context.configurationName;
  let success;
  let childDevServers;

  for await (const output of startAllDevServers(options, context)) {
    try {
      childDevServers = Object.values(output).map((o) => o.childDevServer);
      const firstDevServer = options.devServerTargets[0];
      const firstDevServerOutput = output?.[firstDevServer];
      success = await runCypress(firstDevServerOutput?.baseUrl, options);
      if (!options.watch) break;
    } catch (e) {
      logger.error(e.message);
      success = false;
      if (!options.watch) break;
    }
  }

  childDevServers?.forEach((p) => p?.kill());
  return { success };
}

function normalizeOptions(
  options: CypressExecutorOptions,
  context: ExecutorContext
): NormalizedCypressExecutorOptions {
  options.env = options.env || {};
  if (options.tsConfig) {
    const tsConfigPath = join(context.root, options.tsConfig);
    options.env.tsConfig = tsConfigPath;
    process.env.TS_NODE_PROJECT = tsConfigPath;
  }
  if (options.testingType === 'component') {
    const project = context?.projectGraph?.nodes?.[context.projectName];
    if (project?.data?.root) {
      options.ctTailwindPath = getTempTailwindPath(context);
    }
  }

  if (!options.devServerTargets || options.devServerTargets?.length === 0) {
    options.devServerTargets = [undefined];
  }
  checkSupportedBrowser(options);
  warnDeprecatedHeadless(options);
  warnDeprecatedCypressVersion();
  return options;
}

async function* startAllDevServers(
  options: CypressExecutorOptions,
  context: ExecutorContext
) {
  const devServerOutput: Record<
    string,
    { baseUrl?: string; success?: boolean; childDevServer?: any }
  > = {};
  const allReady = () => {
    // because not every dev server emits,
    // need to make sure we at least have the first one
    // all dev servers have at least been started.
    const firstServer = options.devServerTargets[0];
    return (
      // does not have to have a URL, but needs to be defined
      devServerOutput[firstServer]?.baseUrl !== undefined &&
      Object.keys(devServerOutput).length === options.devServerTargets.length
    );
  };
  return yield* createAsyncIterable<typeof devServerOutput>(
    async ({ next, error, done }) => {
      if (options.devServerTargets.length === 0 || options.skipServe) {
        next({});
      }

      for (const target of options.devServerTargets) {
        const parsedTarget = parseTargetString(target);
        const targetOptions = readTargetOptions(parsedTarget, context);
        const supportsWatch = Object.keys(targetOptions).includes('watch');
        const childDevServer = fork(
          join(__dirname, '..', '..', 'utils', 'start-forked-dev-server.js')
        );
        // make sure all the dev servers are added to output
        // so we can stop all of them downstream
        devServerOutput[target] = {
          childDevServer,
        };
        childDevServer.send({
          context,
          options: {
            parsedTarget,
            targetOptions,
            supportsWatch,
            watch: options.watch,
          },
        });
        childDevServer.on('message', (output: any) => {
          devServerOutput[target] = {
            ...devServerOutput[target],
            success: output?.success,
            baseUrl: options.baseUrl || output?.baseUrl,
          };
          if (allReady()) {
            next(devServerOutput);
          } else {
            console.log('emit', target, output);
          }
        });
      }
    }
  );
}

function checkSupportedBrowser({ browser }: CypressExecutorOptions) {
  // Browser was not passed in as an option, cypress will use whatever default it has set
  // and we dont need to check it
  if (!browser) {
    return;
  }

  if (installedCypressVersion() >= 4 && browser == 'canary') {
    logger.warn(stripIndents`
  Warning:
  You are using a browser that is not supported by cypress v4+.

  Read here for more info:
  https://docs.cypress.io/guides/references/migration-guide.html#Launching-Chrome-Canary-with-browser
  `);
    return;
  }

  const supportedV3Browsers = ['electron', 'chrome', 'canary', 'chromium'];
  if (
    installedCypressVersion() <= 3 &&
    !supportedV3Browsers.includes(browser)
  ) {
    logger.warn(stripIndents`
    Warning:
    You are using a browser that is not supported by cypress v3.
    `);
    return;
  }
}

function warnDeprecatedHeadless({ headless }: CypressExecutorOptions) {
  if (installedCypressVersion() < 8 || headless === undefined) {
    return;
  }

  if (headless) {
    const deprecatedMsg = stripIndents`
    NOTE:
    You can now remove the use of the '--headless' flag during 'cypress run' as this is the default for all browsers.`;

    logger.warn(deprecatedMsg);
  }
}

function warnDeprecatedCypressVersion() {
  if (installedCypressVersion() < 10) {
    logger.warn(stripIndents`
NOTE:
Support for Cypress versions < 10 is deprecated. Please upgrade to at least Cypress version 10. 
A generator to migrate from v8 to v10 is provided. See https://nx.dev/cypress/v10-migration-guide
`);
  }
}

/**
 * @whatItDoes Initialize the Cypress test runner with the provided project configuration.
 * By default, Cypress will run tests from the CLI without the GUI and provide directly the results in the console output.
 * If `watch` is `true`: Open Cypress in the interactive GUI to interact directly with the application.
 */
async function runCypress(
  baseUrl: string,
  opts: NormalizedCypressExecutorOptions
) {
  // Cypress expects the folder where a cypress config is present
  const projectFolderPath = dirname(opts.cypressConfig);
  const options: any = {
    project: projectFolderPath,
    configFile: basename(opts.cypressConfig),
  };
  // If not, will use the `baseUrl` normally from `cypress.json`
  if (baseUrl) {
    options.config = { baseUrl };
  }

  if (opts.browser) {
    options.browser = opts.browser;
  }

  if (opts.env) {
    options.env = opts.env;
  }
  if (opts.spec) {
    options.spec = opts.spec;
  }

  options.tag = opts.tag;
  options.exit = opts.exit;
  options.headed = opts.headed;

  if (opts.headless) {
    options.headless = opts.headless;
  }

  options.record = opts.record;
  options.key = opts.key;
  options.parallel = opts.parallel;
  options.ciBuildId = opts.ciBuildId?.toString();
  options.group = opts.group;
  options.ignoreTestFiles = opts.ignoreTestFiles;

  if (opts.reporter) {
    options.reporter = opts.reporter;
  }

  if (opts.reporterOptions) {
    options.reporterOptions = opts.reporterOptions;
  }

  options.testingType = opts.testingType;

  const result = await (opts.watch
    ? Cypress.open(options)
    : Cypress.run(options));

  if (opts.ctTailwindPath && existsSync(opts.ctTailwindPath)) {
    unlinkSync(opts.ctTailwindPath);
  }
  /**
   * `cypress.open` is returning `0` and is not of the same type as `cypress.run`.
   * `cypress.open` is the graphical UI, so it will be obvious to know what wasn't
   * working. Forcing the build to success when `cypress.open` is used.
   */
  return !result.totalFailed && !result.failures;
}
