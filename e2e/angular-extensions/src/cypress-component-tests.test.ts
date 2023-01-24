import {
  checkFilesDoNotExist,
  cleanupProject,
  createFile,
  newProject,
  runCLI,
  uniq,
  updateFile,
  updateProjectConfig,
  packageInstall,
  readJson,
} from '../../utils';
import { names } from '@nrwl/devkit';
describe('Angular Cypress Component Tests', () => {
  let projectName: string;
  const appName = uniq('cy-angular-app');
  const usedInAppLibName = uniq('cy-angular-lib');
  const buildableLibName = uniq('cy-angular-buildable-lib');

  beforeAll(async () => {
    projectName = newProject({ name: uniq('cy-ng') });
    createAppWithCmp(appName, projectName);
    createLibForApp(usedInAppLibName, appName, projectName);
    createBuildableLib(buildableLibName, projectName);

    addExtraDeps();
    addAssetsToWorkspace();
    addAssetsToApp(appName);
    addAssetsToLib(usedInAppLibName);
  });

  afterAll(() => cleanupProject());

  it('should test app', () => {
    runCLI(
      `generate @nrwl/angular:cypress-component-configuration --project=${appName} --generate-tests --no-interactive`
    );
    expect(runCLI(`component-test ${appName} --no-watch`)).toContain(
      'All specs passed!'
    );
  }, 300_000);

  it('should successfully component test lib being used in app', () => {
    runCLI(
      `generate @nrwl/angular:cypress-component-configuration --project=${usedInAppLibName} --generate-tests --no-interactive`
    );
    expect(runCLI(`component-test ${usedInAppLibName} --no-watch`)).toContain(
      'All specs passed!'
    );
  }, 300_000);

  it('should test buildable lib not being used in app', () => {
    expect(() => {
      // should error since no edge in graph between lib and app
      runCLI(
        `generate @nrwl/angular:cypress-component-configuration --project=${buildableLibName} --generate-tests --no-interactive`
      );
    }).toThrow();
    createFile(
      `libs/${buildableLibName}/src/lib/input/input.component.cy.ts`,
      `
import { MountConfig } from 'cypress/angular';
import { InputComponent } from './input.component';

describe(InputComponent.name, () => {
  const config: MountConfig<InputComponent> = {
    declarations: [],
    imports: [],
    providers: [],
  };

  it('renders', () => {
    cy.mount(InputComponent, config);
    // make sure tailwind isn't getting applied
    cy.get('label').should('have.css', 'color', 'rgb(0, 0, 0)');
  });
  it('should be readonly', () => {
    cy.mount(InputComponent, {
      ...config,
      componentProperties: {
        readOnly: true,
      },
    });
    cy.get('input').should('have.attr', 'readonly');
  });
});
`
    );

    createFile(
      `libs/${buildableLibName}/src/lib/input-standalone/input-standalone.component.cy.ts`,
      `
import { MountConfig } from 'cypress/angular';
import { InputStandaloneComponent } from './input-standalone.component';

describe(InputStandaloneComponent.name, () => {
  const config: MountConfig<InputStandaloneComponent> = {
    declarations: [],
    imports: [],
    providers: [],
  };

  it('renders', () => {
    cy.mount(InputStandaloneComponent, config);
    // make sure tailwind isn't getting applied
    cy.get('label').should('have.css', 'color', 'rgb(0, 0, 0)');
  });
  it('should be readonly', () => {
    cy.mount(InputStandaloneComponent, {
      ...config,
      componentProperties: {
        readOnly: true,
      },
    });
    cy.get('input').should('have.attr', 'readonly');
  });
});
`
    );

    runCLI(
      `generate @nrwl/angular:cypress-component-configuration --project=${buildableLibName} --generate-tests --build-target=${appName}:build --no-interactive`
    );
    expect(runCLI(`component-test ${buildableLibName} --no-watch`)).toContain(
      'All specs passed!'
    );

    // add tailwind
    runCLI(
      `generate @nrwl/angular:setup-tailwind --project=${buildableLibName}`
    );
    updateFile(
      `libs/${buildableLibName}/src/lib/input/input.component.cy.ts`,
      (content) => {
        // text-green-500 should now apply
        return content.replace('rgb(0, 0, 0)', 'rgb(34, 197, 94)');
      }
    );
    updateFile(
      `libs/${buildableLibName}/src/lib/input-standalone/input-standalone.component.cy.ts`,
      (content) => {
        // text-green-500 should now apply
        return content.replace('rgb(0, 0, 0)', 'rgb(34, 197, 94)');
      }
    );

    expect(runCLI(`component-test ${buildableLibName} --no-watch`)).toContain(
      'All specs passed!'
    );
    checkFilesDoNotExist(`tmp/libs/${buildableLibName}/ct-styles.css`);
  }, 300_000);
});

function createAppWithCmp(appName: string, projectName: string) {
  runCLI(`generate @nrwl/angular:app ${appName} --no-interactive`);
  runCLI(
    `generate @nrwl/angular:component fancy-component --project=${appName} --no-interactive`
  );
}

function createLibForApp(
  libName: string,
  appName: string,
  projectName: string
) {
  runCLI(`generate @nrwl/angular:lib ${libName} --no-interactive`);
  runCLI(
    `generate @nrwl/angular:component btn --project=${libName} --inlineTemplate --inlineStyle --export --no-interactive`
  );
  runCLI(
    `generate @nrwl/angular:component btn-standalone --project=${libName} --inlineTemplate --inlineStyle --export --standalone --no-interactive`
  );
  updateFile(
    `libs/${libName}/src/lib/btn/btn.component.ts`,
    `
import { Component, Input } from '@angular/core';

@Component({
  selector: '${projectName}-btn',
  template: '<button class="text-green-500">{{text}}</button>',
  styles: []
})
export class BtnComponent {
  @Input() text = 'something';
}
`
  );
  updateFile(
    `libs/${libName}/src/lib/btn-standalone/btn-standalone.component.ts`,
    `
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
@Component({
  selector: '${projectName}-btn-standalone',
  standalone: true,
  imports: [CommonModule],
  template: '<button class="text-green-500">standlone-{{text}}</button>',
  styles: [],
})
export class BtnStandaloneComponent {
  @Input() text = 'something';
}
`
  );
  // use lib in the app
  createFile(
    `apps/${appName}/src/app/app.component.html`,
    `
<${projectName}-btn></${projectName}-btn>
<${projectName}-btn-standalone></${projectName}-btn-standalone>
<${projectName}-nx-welcome></${projectName}-nx-welcome>
`
  );
  const btnModuleName = names(libName).className;
  updateFile(
    `apps/${appName}/src/app/app.component.scss`,
    `
@use 'styleguide' as *;

h1 {
  @include headline;
}

p {
  color: $color-one;
}
`
  );
  updateFile(
    `apps/${appName}/src/app/app.module.ts`,
    `
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {${btnModuleName}Module} from "@${projectName}/${libName}";

import { AppComponent } from './app.component';
import { NxWelcomeComponent } from './nx-welcome.component';

@NgModule({
  declarations: [AppComponent, NxWelcomeComponent],
  imports: [BrowserModule, ${btnModuleName}Module],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
`
  );
}

function createBuildableLib(libName: string, projectName: string) {
  runCLI(`generate @nrwl/angular:lib ${libName} --buildable --no-interactive`);
  runCLI(
    `generate @nrwl/angular:component input --project=${libName} --inlineTemplate --inlineStyle --export --no-interactive`
  );
  runCLI(
    `generate @nrwl/angular:component input-standalone --project=${libName} --inlineTemplate --inlineStyle --export --standalone --no-interactive`
  );
  updateFile(
    `libs/${libName}/src/lib/input/input.component.ts`,
    `
import {Component, Input} from '@angular/core';

@Component({
  selector: '${projectName}-input',
  template: \`<label class="text-green-500">Email: <input class="border-blue-500" type="email" [readOnly]="readOnly"></label>\`,
    styles  : []
  })
  export class InputComponent{
    @Input() readOnly = false;
  }
  `
  );
  updateFile(
    `libs/${libName}/src/lib/input-standalone/input-standalone.component.ts`,
    `
import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
@Component({
  selector: '${projectName}-input-standalone',
  standalone: true,
  imports: [CommonModule],
  template: \`<label class="text-green-500">Email: <input class="border-blue-500" type="email" [readOnly]="readOnly"></label>\`,
    styles  : []
  })
  export class InputStandaloneComponent{
    @Input() readOnly = false;
  }
  `
  );
}
function addAssetsToWorkspace() {
  createFile('libs/assets/data.json', JSON.stringify({ data: 'data' }));
  createFile(
    'assets/styles/styleguide.scss',
    `
$color-one: pink;
$color-two: blue;

@mixin headline {
  font-weight: bold;
  color: darkkhaki;
  background: lightcoral;
  font-weight: 24px;
}
  `
  );
}

function addAssetsToApp(appName: string) {
  createFile(
    `apps/${appName}/src/assets/logo.svg`,
    `<svg width="1000" height="1000" viewBox="0 0 1000 1000" fill="none"
  xmlns="http://www.w3.org/2000/svg">
  <path
    d="M543.321 552.663L465.329 430.752L465.212 533.183L330.799 306.89H236.24V688.908H329.742L330.047 462.898L463.073 678.78L543.321 552.663V552.663Z"
    fill="#002F56" />
  <path
    d="M465.352 405.091H558.735L558.947 404.01V306.89H465.446L465.328 404.01L465.352 405.091V405.091Z"
    fill="#002F56" />
  <path
    d="M703.065 511C680.694 510.576 660.482 524.292 652.613 545.237C665.713 525.647 690.657 517.775 712.629 526.297C722.78 530.433 736.128 537.107 746.702 533.535C736.645 519.421 720.395 511.029 703.065 511V511Z"
    fill="#143055" />
  <path
    d="M809.02 556.963C809.02 545.52 802.793 542.864 789.869 538.165C780.281 534.828 769.401 531.068 761.482 520.728C759.931 518.684 758.498 516.381 756.97 513.937C753.549 507.608 748.909 502.017 743.318 497.488C735.775 491.943 725.882 489.24 713.051 489.24C687.307 489.258 664.113 504.798 654.305 528.601C666.705 511.394 687.313 502.072 708.423 504.118C729.532 506.165 747.966 519.273 756.829 538.541C761.258 545.848 769.992 549.338 778.237 547.094C790.856 544.392 789.986 556.329 809.044 560.371L809.02 556.963Z"
    fill="#143055" />
  <path
    d="M850.636 554.519V554.261C850.354 478.501 788.858 413.691 713.051 413.691C666.752 413.659 623.549 436.944 598.119 475.634L597.626 474.788L558.712 413.691H465.352L554.059 552.616L467.49 688.908H558.171L597.626 628.305L637.785 688.908H728.49L646.245 559.477C644.879 556.956 644.138 554.143 644.083 551.276C644.076 532.995 651.336 515.461 664.262 502.534C677.189 489.608 694.723 482.348 713.004 482.355C751.119 482.355 757.487 505.148 765.712 515.864C781.949 537.013 814.378 527.754 814.378 555.342V555.342C814.474 561.806 818.012 567.728 823.659 570.876C829.305 574.025 836.203 573.922 841.753 570.606C847.303 567.29 850.662 561.265 850.566 554.801V554.801V554.519H850.636Z"
    fill="#002F56" />
  <path
    d="M850.731 574.023C851.653 580.466 850.741 587.039 848.1 592.987C842.93 604.948 834.306 600.953 834.306 600.953C834.306 600.953 826.88 597.334 831.392 590.402C836.397 582.671 846.29 583.564 850.731 574.023Z"
    fill="#002F56" />
</svg>`
  );
  updateProjectConfig(appName, (config) => {
    config.targets['build'].options.stylePreprocessorOptions = {
      includePaths: ['assets/styles'],
    };
    config.targets['build'].options.assets.push({
      glob: '**/*',
      input: 'libs/assets',
      output: 'assets',
    });
    return config;
  });

  updateFile('apps/${appName}/src/app/app.component.html', (content) => {
    return `${content}
    <mat-icon svgIcon="logo"></mat-icon>
      <img src="assets/logo.svg" />
      `;
  });
}

function addAssetsToLib(libName: string) {}

function addExtraDeps() {
  const pkgJson = readJson('package.json');
  const ngVersion = pkgJson.dependencies['@angular/core'];
  packageInstall(`@angular/material@${ngVersion}`);
  packageInstall(`@angular/cdk@${ngVersion}`);
}
