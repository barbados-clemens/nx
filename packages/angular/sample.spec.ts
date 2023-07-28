/* eslint-disable */
import { beforeEach, describe, it, mock } from 'node:test';
import * as assert from 'node:assert';
import {
  updateJson,
  Tree,
  readProjectConfiguration,
  getProjects,
  readJson,
  parseJson,
  readNxJson,
  stripIndents,
  updateNxJson,
  NxJsonConfiguration,
} from '@nx/devkit';
import * as dk from '@nx/devkit';
import * as Enquirer from 'enquirer';
import { createTreeWithEmptyWorkspace } from 'nx/src/devkit-testing-exports';
import { generateTestApplication } from './src/generators/utils/testing';
import { E2eTestRunner, UnitTestRunner } from './src/utils/test-runners';
import { Linter } from '@nx/linter';
import { Schema } from './src/generators/application/schema';
import {
  autoprefixerVersion,
  postcssVersion,
  tailwindVersion,
} from './src/utils/versions';

describe('node test runner app', () => {
  let appTree: Tree;
  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  describe('not nested', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });
    it('should create project configs', async () => {
      // ACT
      await generateApp(appTree);

      assert.ok(readProjectConfiguration(appTree, 'my-app'));
      assert.ok(readProjectConfiguration(appTree, 'my-app-e2e'));
    });

    it('should not produce tests when UnitTestRunner = none', async () => {
      // ACT
      await generateApp(appTree, 'my-app', {
        unitTestRunner: UnitTestRunner.None,
      });
      const { targets } = readProjectConfiguration(appTree, 'my-app');
      assert.equal(!!targets.test, false);
      assert.equal(
        !!appTree.exists('apps/my-app/src/app/app.component.spec.ts'),
        false
      );
    });

    it('should remove the e2e target on the application', async () => {
      // ACT
      await generateApp(appTree);

      // ASSERT
      assert.equal(
        !!readProjectConfiguration(appTree, 'my-app').targets.e2e,
        false
      );
    });

    it('should update tags + implicit dependencies', async () => {
      // ACT
      await generateApp(appTree, 'myApp', { tags: 'one,two,my-app' });

      // ASSERT
      const projects = getProjects(appTree);
      assert.ok(
        projects
        // new Map(
        //   Object.entries({
        //     'my-app': {
        //       tags: ['one', 'two', 'my-app'],
        //     },
        //     'my-app-e2e': {
        //       implicitDependencies: ['my-app'],
        //       tags: [],
        //     },
        //   })
        // )
      );
    });

    it('should generate files', async () => {
      await generateApp(appTree);

      assert.ok(appTree.exists(`apps/my-app/jest.config.ts`));
      assert.ok(appTree.exists('apps/my-app/src/main.ts'));
      assert.ok(appTree.exists('apps/my-app/src/app/app.module.ts'));
      assert.ok(appTree.exists('apps/my-app/src/app/app.component.ts'));
      assert.match(
        appTree.read('apps/my-app/src/app/app.module.ts', 'utf-8'),
        /class AppModule/
      );

      assert.ok(readJson(appTree, 'apps/my-app/tsconfig.json'));

      const tsconfigApp = parseJson(
        appTree.read('apps/my-app/tsconfig.app.json', 'utf-8')
      );
      assert.ok(tsconfigApp);

      const eslintrcJson = parseJson(
        appTree.read('apps/my-app/.eslintrc.json', 'utf-8')
      );
      assert.deepEqual(eslintrcJson.extends, ['../../.eslintrc.json']);

      assert.ok(appTree.exists('apps/my-app-e2e/cypress.config.ts'));
      const tsconfigE2E = parseJson(
        appTree.read('apps/my-app-e2e/tsconfig.json', 'utf-8')
      );
      assert.ok(tsconfigE2E);
    });

    it('should setup jest with serializers', async () => {
      await generateApp(appTree);

      assert.ok(
        appTree
          .read('apps/my-app/jest.config.ts', 'utf-8')
          .includes(`'jest-preset-angular/build/serializers/no-ng-attributes'`)
      );
      assert.ok(
        appTree
          .read('apps/my-app/jest.config.ts', 'utf-8')
          .includes(`'jest-preset-angular/build/serializers/ng-snapshot'`)
      );
      assert.ok(
        appTree
          .read('apps/my-app/jest.config.ts', 'utf-8')
          .includes(`'jest-preset-angular/build/serializers/html-comment'`)
      );
    });

    it('should support a root tsconfig.json instead of tsconfig.base.json', async () => {
      // ARRANGE
      appTree.rename('tsconfig.base.json', 'tsconfig.json');

      // ACT
      await generateApp(appTree, 'app');

      // ASSERT
      const appTsConfig = readJson(appTree, 'apps/app/tsconfig.json');
      assert.equal(appTsConfig.extends, '../../tsconfig.json');
    });

    it('should not overwrite default project if already set', async () => {
      // ARRANGE
      const nxJson = readNxJson(appTree);
      nxJson.defaultProject = 'some-awesome-project';
      updateNxJson(appTree, nxJson);

      // ACT
      await generateApp(appTree);

      // ASSERT
      const { defaultProject } = readNxJson(appTree);
      assert.equal(defaultProject, 'some-awesome-project');
    });
  });

  describe('nested', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });
    it('should create project configs', async () => {
      await generateApp(appTree, 'myApp', { directory: 'myDir' });
      assert.ok(readProjectConfiguration(appTree, 'my-dir-my-app'));
      assert.ok(readProjectConfiguration(appTree, 'my-dir-my-app-e2e'));
    });

    it('should update tags + implicit dependencies', async () => {
      await generateApp(appTree, 'myApp', {
        directory: 'myDir',
        tags: 'one,two,my-dir-my-app',
      });
      const projects = getProjects(appTree);
      assert.ok(
        projects
        // new Map(
        //   Object.entries({
        //     'my-dir-my-app': {
        //       tags: ['one', 'two', 'my-dir-my-app'],
        //     },
        //     'my-dir-my-app-e2e': {
        //       implicitDependencies: ['my-dir-my-app'],
        //       tags: [],
        //     },
        //   })
        // )
      );
    });

    it('should generate files', async () => {
      const hasJsonValue = ({ path, expectedValue, lookupFn }) => {
        const content = readJson(appTree, path);

        assert.deepEqual(lookupFn(content), expectedValue);
      };
      await generateApp(appTree, 'myApp', { directory: 'myDir' });

      const appModulePath = 'apps/my-dir/my-app/src/app/app.module.ts';
      assert.ok(
        appTree.read(appModulePath, 'utf-8').includes('class AppModule')
      );

      // Make sure these exist
      [
        `apps/my-dir/my-app/jest.config.ts`,
        'apps/my-dir/my-app/src/main.ts',
        'apps/my-dir/my-app/src/app/app.module.ts',
        'apps/my-dir/my-app/src/app/app.component.ts',
        'apps/my-dir/my-app-e2e/cypress.config.ts',
      ].forEach((path) => {
        assert.ok(appTree.exists(path));
      });

      // Make sure these have properties
      [
        {
          path: 'apps/my-dir/my-app/tsconfig.app.json',
          lookupFn: (json) => json.compilerOptions.outDir,
          expectedValue: '../../../dist/out-tsc',
        },
        {
          path: 'apps/my-dir/my-app/tsconfig.app.json',
          lookupFn: (json) => json.exclude,
          expectedValue: [
            'jest.config.ts',
            'src/**/*.test.ts',
            'src/**/*.spec.ts',
          ],
        },
        {
          path: 'apps/my-dir/my-app/.eslintrc.json',
          lookupFn: (json) => json.extends,
          expectedValue: ['../../../.eslintrc.json'],
        },
      ].forEach(hasJsonValue);
    });

    it('should extend from tsconfig.base.json', async () => {
      // ACT
      await generateApp(appTree, 'app', { directory: 'myDir' });

      // ASSERT
      const appTsConfig = readJson(appTree, 'apps/my-dir/app/tsconfig.json');
      assert.equal(appTsConfig.extends, '../../../tsconfig.base.json');
    });

    it('should support a root tsconfig.json instead of tsconfig.base.json', async () => {
      // ARRANGE
      appTree.rename('tsconfig.base.json', 'tsconfig.json');

      // ACT
      await generateApp(appTree, 'app', { directory: 'myDir' });

      // ASSERT
      const appTsConfig = readJson(appTree, 'apps/my-dir/app/tsconfig.json');
      assert.equal(appTsConfig.extends, '../../../tsconfig.json');
    });
  });

  describe('at the root', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      updateJson(appTree, 'nx.json', (json) => ({
        ...json,
        workspaceLayout: { appsDir: '' },
      }));
    });

    it('should accept numbers in the path', async () => {
      // ACT
      await generateApp(appTree, 'myApp', { directory: 'src/9-websites' });

      // ASSERT

      assert.ok(
        readProjectConfiguration(appTree, 'src-9-websites-my-app').root
      );
    });

    it('should generate files', async () => {
      const hasJsonValue = ({ path, expectedValue, lookupFn }) => {
        const content = readJson(appTree, path);

        assert.deepEqual(lookupFn(content), expectedValue);
      };
      await generateApp(appTree, 'myApp', { directory: 'myDir' });

      const appModulePath = 'my-dir/my-app/src/app/app.module.ts';
      assert.match(appTree.read(appModulePath, 'utf-8'), /class AppModule/);

      // Make sure these exist
      [
        'my-dir/my-app/jest.config.ts',
        'my-dir/my-app/src/main.ts',
        'my-dir/my-app/src/app/app.module.ts',
        'my-dir/my-app/src/app/app.component.ts',
        'my-dir/my-app-e2e/cypress.config.ts',
      ].forEach((path) => {
        assert.ok(appTree.exists(path));
      });

      // Make sure these have properties
      [
        {
          path: 'my-dir/my-app/tsconfig.app.json',
          lookupFn: (json) => json.compilerOptions.outDir,
          expectedValue: '../../dist/out-tsc',
        },
        {
          path: 'my-dir/my-app/tsconfig.app.json',
          lookupFn: (json) => json.exclude,
          expectedValue: [
            'jest.config.ts',
            'src/**/*.test.ts',
            'src/**/*.spec.ts',
          ],
        },
        {
          path: 'my-dir/my-app/.eslintrc.json',
          lookupFn: (json) => json.extends,
          expectedValue: ['../../.eslintrc.json'],
        },
      ].forEach(hasJsonValue);
    });
  });

  describe('routing', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });

    it('should include RouterTestingModule', async () => {
      await generateApp(appTree, 'myApp', {
        directory: 'myDir',
        routing: true,
      });

      assert.match(
        appTree.read('apps/my-dir/my-app/src/app/app.module.ts', 'utf-8'),
        /RouterModule.forRoot/
      );
      assert.match(
        appTree.read(
          'apps/my-dir/my-app/src/app/app.component.spec.ts',
          'utf-8'
        ),
        /imports: \[RouterTestingModule\]/
      );
    });

    it('should not modify tests when --skip-tests is set', async () => {
      await generateApp(appTree, 'myApp', {
        directory: 'myDir',
        routing: true,
        skipTests: true,
      });
      assert.equal(
        !!appTree.exists('apps/my-dir/my-app/src/app/app.component.spec.ts'),
        false
      );
    });
  });

  describe('template generation mode', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });

    it('should create Nx specific `app.component.html` template', async () => {
      await generateApp(appTree, 'myApp', { directory: 'myDir' });
      assert.match(
        appTree.read('apps/my-dir/my-app/src/app/app.component.html', 'utf-8'),
        /<proj-nx-welcome><\/proj-nx-welcome>/
      );
    });

    it("should update `template`'s property of AppComponent with Nx content", async () => {
      await generateApp(appTree, 'myApp', {
        directory: 'myDir',
        inlineTemplate: true,
      });
      assert.match(
        appTree.read('apps/my-dir/my-app/src/app/app.component.ts', 'utf-8'),
        /<proj-nx-welcome><\/proj-nx-welcome>/
      );
    });

    it('should create Nx specific `nx-welcome.component.ts` file', async () => {
      await generateApp(appTree, 'myApp', { directory: 'myDir' });
      assert.match(
        appTree.read(
          'apps/my-dir/my-app/src/app/nx-welcome.component.ts',
          'utf-8'
        ),
        /Hello there/
      );
    });

    it('should update the AppComponent spec to target Nx content', async () => {
      await generateApp(appTree, 'myApp', {
        directory: 'myDir',
        inlineTemplate: true,
      });
      const testFileContent = appTree.read(
        'apps/my-dir/my-app/src/app/app.component.spec.ts',
        'utf-8'
      );

      assert.match(testFileContent, /querySelector\('h1'\)/);
      assert.match(testFileContent, /Welcome my-dir-my-app/);
    });
  });

  describe('--style scss', () => {
    it('should generate scss styles', async () => {
      await generateApp(appTree, 'myApp', { style: 'scss' });
      assert.ok(appTree.exists('apps/my-app/src/app/app.component.scss'));
    });
  });

  describe('--style sass', () => {
    it('should generate sass styles', async () => {
      await generateApp(appTree, 'myApp', { style: 'sass' });
      assert.ok(appTree.exists('apps/my-app/src/app/app.component.sass'));
    });
  });

  describe('--style less', () => {
    it('should generate less styles', async () => {
      await generateApp(appTree, 'myApp', { style: 'less' });
      assert.ok(appTree.exists('apps/my-app/src/app/app.component.less'));
    });
  });

  describe('--skipFormat', () => {
    it('should format files by default', async (t) => {
      mock
        .method(dk, 'formatFiles')
        .mock.mockImplementation(() => Promise.resolve());

      await generateApp(appTree);

      // @ts-expect-error it's a mock
      assert.equal(dk.formatFiles.mock.calls.length, 1);
    });

    // Need a better way of determing if the formatFiles function
    // was called directly from the application generator
    // and not by a different generator that's used withing this
    // xit('should skip format when set to true', async () => {
    //   const spy = jest.spyOn(devkit, 'formatFiles');

    //   await generateApp(appTree, 'myApp', { skipFormat: true });

    //   expect(spy).not.toHaveBeenCalled();
    // });
  });

  describe('--linter', () => {
    describe('eslint', () => {
      beforeEach(() => {
        appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      });
      it('should add lint taret', async () => {
        await generateApp(appTree, 'myApp', { linter: Linter.EsLint });
        assert.deepEqual(
          readProjectConfiguration(appTree, 'my-app').targets.lint,
          {
            executor: '@nx/linter:eslint',
            options: {
              lintFilePatterns: [
                'apps/my-app/**/*.ts',
                'apps/my-app/**/*.html',
              ],
            },
            outputs: ['{options.outputFile}'],
          }
        );

        assert.deepEqual(
          readProjectConfiguration(appTree, 'my-app-e2e').targets.lint,
          {
            executor: '@nx/linter:eslint',
            options: {
              lintFilePatterns: ['apps/my-app-e2e/**/*.{js,ts}'],
            },
            outputs: ['{options.outputFile}'],
          }
        );
      });

      it('should add valid eslint JSON configuration which extends from Nx presets', async () => {
        await generateApp(appTree, 'myApp', { linter: Linter.EsLint });

        const eslintConfig = readJson(appTree, 'apps/my-app/.eslintrc.json');
        assert.deepEqual(eslintConfig, {
          extends: ['../../.eslintrc.json'],
          ignorePatterns: ['!**/*'],
          overrides: [
            {
              extends: [
                'plugin:@nx/angular',
                'plugin:@angular-eslint/template/process-inline-templates',
              ],
              files: ['*.ts'],
              rules: {
                '@angular-eslint/component-selector': [
                  'error',
                  {
                    prefix: 'proj',
                    style: 'kebab-case',
                    type: 'element',
                  },
                ],
                '@angular-eslint/directive-selector': [
                  'error',
                  {
                    prefix: 'proj',
                    style: 'camelCase',
                    type: 'attribute',
                  },
                ],
              },
            },
            {
              extends: ['plugin:@nx/angular-template'],
              files: ['*.html'],
              rules: {},
            },
          ],
        });
      });
    });

    describe('none', () => {
      beforeEach(() => {
        appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      });
      it('should add no lint target', async () => {
        await generateApp(appTree, 'myApp', { linter: Linter.None });
        assert.equal(
          !!readProjectConfiguration(appTree, 'my-app').targets.lint,
          false
        );
      });
    });
  });

  describe('--unit-test-runner', () => {
    describe('default (jest)', () => {
      beforeEach(() => {
        appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      });

      it('should generate jest.config.ts with serializers', async () => {
        await generateApp(appTree);

        const jestConfig = appTree.read('apps/my-app/jest.config.ts', 'utf-8');

        assert.ok(
          jestConfig.includes(
            `'jest-preset-angular/build/serializers/no-ng-attributes'`
          )
        );
        assert.ok(
          jestConfig.includes(
            `'jest-preset-angular/build/serializers/ng-snapshot'`
          )
        );
        assert.ok(
          jestConfig.includes(
            `'jest-preset-angular/build/serializers/html-comment'`
          )
        );
      });

      it('should add reference to tsconfig.spec.json to tsconfig.json', async () => {
        await generateApp(appTree);

        const { references } = readJson(appTree, 'apps/my-app/tsconfig.json');
        assert.ok(
          references.find((r) => r.path.includes('tsconfig.spec.json'))
        );
      });
    });

    describe('none', () => {
      beforeEach(() => {
        appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      });

      it('should not generate test configuration', async () => {
        await generateApp(appTree, 'myApp', {
          unitTestRunner: UnitTestRunner.None,
        });
        assert.equal(!!appTree.exists('apps/my-app/src/test-setup.ts'), false);
        assert.equal(!!appTree.exists('apps/my-app/src/test.ts'), false);
        assert.equal(!!appTree.exists('apps/my-app/tsconfig.spec.json'), false);
        assert.equal(!!appTree.exists('apps/my-app/jest.config.ts'), false);
        assert.equal(!!appTree.exists('apps/my-app/karma.config.js'), false);
        assert.equal(
          !!appTree.exists('apps/my-app/src/app/app.component.spec.ts'),
          false
        );
        assert.equal(
          !!readProjectConfiguration(appTree, 'my-app').targets.test,
          false
        );
        // check tsconfig.spec.json is not referenced
        const { references } = readJson(appTree, 'apps/my-app/tsconfig.json');
        assert.ok(
          references.every((r) => !r.path.includes('tsconfig.spec.json'))
        );
      });
    });
  });

  describe('--e2e-test-runner', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });
    describe('none', () => {
      it('should not generate test configuration', async () => {
        await generateApp(appTree, 'myApp', {
          e2eTestRunner: E2eTestRunner.None,
        });
        assert.equal(!!appTree.exists('apps/my-app-e2e'), false);
      });
    });
  });

  describe('--backend-project', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });
    describe('with a backend project', () => {
      it('should add a proxy.conf.json to app', async () => {
        await generateApp(appTree, 'customer-ui', {
          backendProject: 'customer-api',
        });

        const proxyConfContent = JSON.stringify(
          {
            '/customer-api': {
              target: 'http://localhost:3333',
              secure: false,
            },
          },
          null,
          2
        );

        assert.ok(appTree.exists('apps/customer-ui/proxy.conf.json'));
        assert.ok(
          appTree
            .read('apps/customer-ui/proxy.conf.json', 'utf-8')
            .includes(proxyConfContent)
        );
      });
    });

    describe('with no backend project', () => {
      it('should not generate a proxy.conf.json', async () => {
        await generateApp(appTree, 'customer-ui');

        assert.equal(appTree.exists('apps/customer-ui/proxy.conf.json'), false);
      });
    });
  });

  describe('--strict', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });

    it('should enable strict type checking', async () => {
      await generateApp(appTree, 'my-app', { strict: true });

      const appTsConfig = readJson(appTree, 'apps/my-app/tsconfig.json');
      assert.ok(appTsConfig);
      const e2eTsConfig = readJson(appTree, 'apps/my-app-e2e/tsconfig.json');
      assert.ok(e2eTsConfig);

      // should not update workspace configuration since --strict=true is the default
      const nxJson = readJson<NxJsonConfiguration>(appTree, 'nx.json');
      assert.equal(
        !!nxJson.generators['@nx/angular:application'].strict,
        false
      );
    });

    it('should set defaults when --strict=false', async () => {
      await generateApp(appTree, 'my-app', { strict: false });

      // check to see if the workspace configuration has been updated to turn off
      // strict mode by default in future applications
      const nxJson = readJson<NxJsonConfiguration>(appTree, 'nx.json');
      assert.equal(nxJson.generators['@nx/angular:application'].strict, false);
    });
  });

  describe('--add-tailwind', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });

    it('should not add a tailwind.config.js and relevant packages when "--add-tailwind" is not specified', async () => {
      // ACT
      await generateApp(appTree, 'app1');

      // ASSERT
      assert.equal(!!appTree.exists('apps/app1/tailwind.config.js'), false);
      const { devDependencies } = readJson(appTree, 'package.json');
      assert.equal(!!devDependencies['tailwindcss'], false);
      assert.equal(!!devDependencies['postcss'], false);
      assert.equal(!!devDependencies['autoprefixer'], false);
    });

    it('should not add a tailwind.config.js and relevant packages when "--add-tailwind=false"', async () => {
      // ACT
      await generateApp(appTree, 'app1', { addTailwind: false });

      // ASSERT
      assert.equal(!!appTree.exists('apps/app1/tailwind.config.js'), false);
      const { devDependencies } = readJson(appTree, 'package.json');
      assert.equal(!!devDependencies['tailwindcss'], false);
      assert.equal(!!devDependencies['postcss'], false);
      assert.equal(!!devDependencies['autoprefixer'], false);
    });

    it('should add a tailwind.config.js and relevant packages when "--add-tailwind=true"', async () => {
      // ACT
      await generateApp(appTree, 'app1', { addTailwind: true });

      // ASSERT
      assert.equal(
        appTree.read('apps/app1/tailwind.config.js', 'utf-8'),
        `const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
`
      );
      const { devDependencies } = readJson(appTree, 'package.json');
      assert.equal(devDependencies['tailwindcss'], tailwindVersion);
      assert.equal(devDependencies['postcss'], postcssVersion);
      assert.equal(devDependencies['autoprefixer'], autoprefixerVersion);
    });
  });

  describe('--standalone', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });

    it('should generate a standalone app correctly with routing', async () => {
      // ACT
      await generateApp(appTree, 'standalone', {
        standalone: true,
        routing: true,
      });

      // ASSERT
      assert.ok(appTree.read('apps/standalone/src/main.ts', 'utf-8'));
      assert.ok(appTree.read('apps/standalone/src/app/app.config.ts', 'utf-8'));
      assert.ok(appTree.read('apps/standalone/src/app/app.routes.ts', 'utf-8'));
      assert.ok(
        appTree.read('apps/standalone/src/app/app.component.ts', 'utf-8')
      );
      assert.ok(
        appTree.read('apps/standalone/src/app/app.component.spec.ts', 'utf-8')
      );
      assert.equal(
        !!appTree.exists('apps/standalone/src/app/app.module.ts'),
        false
      );
      assert.match(
        appTree.read(
          'apps/standalone/src/app/nx-welcome.component.ts',
          'utf-8'
        ),
        /standalone: true/
      );
    });

    it('should generate a standalone app correctly without routing', async () => {
      // ACT
      await generateApp(appTree, 'standalone', {
        standalone: true,
        routing: false,
      });

      // ASSERT
      assert.ok(appTree.read('apps/standalone/src/main.ts', 'utf-8'));
      assert.ok(appTree.read('apps/standalone/src/app/app.config.ts', 'utf-8'));
      assert.ok(
        appTree.read('apps/standalone/src/app/app.component.ts', 'utf-8')
      );
      assert.ok(
        appTree.read('apps/standalone/src/app/app.component.spec.ts', 'utf-8')
      );
      assert.equal(
        appTree.exists('apps/standalone/src/app/app.module.ts'),
        false
      );
      assert.match(
        appTree.read(
          'apps/standalone/src/app/nx-welcome.component.ts',
          'utf-8'
        ),
        /standalone: true/
      );
    });

    it.skip('should prompt for standalone components and not use them when the user selects false', async () => {
      // ARRANGE
      process.env.NX_INTERACTIVE = 'true';

      const fn = mock
        .method(Enquirer, 'prompt')
        .mock.mockImplementation(() =>
          Promise.resolve({ 'standalone-components': true })
        );

      // ACT
      await generateApp(appTree, 'nostandalone');

      // ASSERT
      assert.ok(appTree.exists('apps/nostandalone/src/app/app.module.ts'));

      // CLEANUP
      process.env.NX_INTERACTIVE = undefined;
    });

    // issue trying to mock Enquirer 🤔
    // Error [ERR_TAP_LEXER_ERROR]: Unexpected character:  at line 1, column 0
    // at Socket.emit (node:events:513:28) {
    // code: 'ERR_TAP_LEXER_ERROR'
    // }
    it.skip('should prompt for standalone components and use them when the user selects true', async () => {
      console.log({ p: Enquirer.prompt });
      // ARRANGE
      process.env.NX_INTERACTIVE = 'true';
      mock
        .fn(Enquirer.prompt)
        .mock.mockImplementation(() =>
          Promise.resolve({ 'standalone-components': true })
        );

      console.log({ p: Enquirer.prompt });
      // ACT
      await generateApp(appTree, 'nostandalone');

      // ASSERT
      assert.equal(
        appTree.exists('apps/nostandalone/src/app/app.module.ts'),
        false
      );
      // assert.equal(Enquirer.prompt.mock.calls.length, 1);

      // CLEANUP
      process.env.NX_INTERACTIVE = undefined;
    });
  });

  it('should generate correct main.ts', async () => {
    // ACT
    await generateApp(appTree, 'myapp');

    // ASSERT
    assert.equal(
      stripIndents`${appTree.read('apps/myapp/src/main.ts', 'utf-8')}`,
      stripIndents`import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
`
    );
  });

  describe('--root-project', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });

    it('should create files at the root', async () => {
      await generateApp(appTree, 'my-app', {
        rootProject: true,
      });

      assert.ok(appTree.exists('src/main.ts'));
      assert.ok(appTree.exists('src/app/app.module.ts'));
      assert.ok(appTree.exists('src/app/app.component.ts'));
      assert.ok(appTree.exists('e2e/cypress.config.ts'));
      assert.equal(!!readJson(appTree, 'tsconfig.json').extends, false);
      const project = readProjectConfiguration(appTree, 'my-app');
      assert.equal(project.targets.build.options['outputPath'], 'dist/my-app');
    });
  });

  it('should error correctly when Angular version does not support standalone', async () => {
    // ARRANGE
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    updateJson(tree, 'package.json', (json) => ({
      ...json,
      dependencies: {
        '@angular/core': '14.0.0',
      },
    }));

    // ACT & ASSERT
    await assert.rejects(
      generateApp(tree, 'my-app', {
        standalone: true,
      }),
      {
        message: stripIndents`The "standalone" option is only supported in Angular >= 14.1.0. You are currently using 14.0.0.
     You can resolve this error by removing the "standalone" option or by migrating to Angular 14.1.0.`,
      }
    );

    // .rejects
    //   .toThrow(stripIndents`The "standalone" option is only supported in Angular >= 14.1.0. You are currently using 14.0.0.
    // You can resolve this error by removing the "standalone" option or by migrating to Angular 14.1.0.`);
  });

  describe('--minimal', () => {
    beforeEach(() => {
      appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    });

    it('should skip "nx-welcome.component.ts" file and references for non-standalone apps without routing', async () => {
      await generateApp(appTree, 'plain', { minimal: true });

      assert.equal(
        appTree.exists('apps/plain/src/app/nx-welcome.component.ts'),
        false
      );
      assert.ok(appTree.read('apps/plain/src/app/app.module.ts', 'utf-8'));
      assert.ok(appTree.read('apps/plain/src/app/app.component.ts', 'utf-8'));
      assert.ok(
        appTree.read('apps/plain/src/app/app.component.spec.ts', 'utf-8')
      );
      assert.ok(appTree.read('apps/plain/src/app/app.component.html', 'utf-8'));
    });

    it('should skip "nx-welcome.component.ts" file and references for non-standalone apps with routing', async () => {
      await generateApp(appTree, 'plain', { minimal: true, routing: true });

      assert.equal(
        !!appTree.exists('apps/plain/src/app/nx-welcome.component.ts'),
        false
      );
      assert.ok(appTree.read('apps/plain/src/app/app.module.ts', 'utf-8'));
      assert.ok(appTree.read('apps/plain/src/app/app.component.ts', 'utf-8'));
      assert.ok(
        appTree.read('apps/plain/src/app/app.component.spec.ts', 'utf-8')
      );
      assert.ok(appTree.read('apps/plain/src/app/app.component.html', 'utf-8'));
    });

    it('should skip "nx-welcome.component.ts" file and references for standalone apps without routing', async () => {
      await generateApp(appTree, 'plain', { minimal: true, standalone: true });

      assert.equal(
        appTree.exists('apps/plain/src/app/nx-welcome.component.ts'),
        false
      );
      assert.ok(appTree.read('apps/plain/src/app/app.component.ts', 'utf-8'));
      assert.ok(
        appTree.read('apps/plain/src/app/app.component.spec.ts', 'utf-8')
      );
      assert.ok(appTree.read('apps/plain/src/app/app.component.html', 'utf-8'));
    });

    it('should skip "nx-welcome.component.ts" file and references for standalone apps with routing', async () => {
      await generateApp(appTree, 'plain', {
        minimal: true,
        standalone: true,
        routing: true,
      });

      assert.equal(
        appTree.exists('apps/plain/src/app/nx-welcome.component.ts'),
        false
      );
      assert.ok(appTree.read('apps/plain/src/app/app.component.ts', 'utf-8'));
      assert.ok(
        appTree.read('apps/plain/src/app/app.component.spec.ts', 'utf-8')
      );
      assert.ok(appTree.read('apps/plain/src/app/app.component.html', 'utf-8'));
    });

    it('should generate a correct build target for --bundler=esbuild', async () => {
      await generateApp(appTree, 'ngesbuild', {
        routing: true,
        bundler: 'esbuild',
      });

      const project = readProjectConfiguration(appTree, 'ngesbuild');
      assert.equal(
        project.targets.build.executor,
        '@angular-devkit/build-angular:browser-esbuild'
      );
      assert.equal(
        !!project.targets.build.configurations.development.namedChunks,
        false
      );
      assert.equal(
        !!project.targets.build.configurations.development.vendorChunks,
        false
      );
      assert.equal(
        !!project.targets.build.configurations.production.budgets,
        false
      );
    });
  });
});

async function generateApp(
  appTree: Tree,
  name: string = 'myApp',
  options: Partial<Schema> = {}
) {
  await generateTestApplication(appTree, {
    name,
    skipFormat: false,
    e2eTestRunner: E2eTestRunner.Cypress,
    unitTestRunner: UnitTestRunner.Jest,
    linter: Linter.EsLint,
    ...options,
  });
}
