import { Command } from 'commander';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { join } from 'path';
import pc from 'picocolors';

const program = new Command();

// information about the CLI tool
program
  .name('scaffold-cli')
  .description('CLI tool for scaffolding new modules')
  .version('1.0.0');

program
  .argument('<moduleName>', 'Name of the module to scaffold (kebab-case)')
  .action(async (moduleName: string) => {
    const pascalName = toPascalCase(moduleName);

    const baseDir = join('src', 'modules', moduleName);
    if (await checkExistDir(baseDir)) {
      console.error(pc.red(`Error: Module "${moduleName}" already exists.`));
      process.exit(1);
    }

    // Paths mirror src/modules/board/ — the reference layout named in
    // CLAUDE.md. Content is intentionally empty: this only gets the file tree
    // and naming right, not the implementation.
    const files: Record<string, string> = {
      [`application/dtos/${moduleName}.request.dto.ts`]:
        requestDtoTemplate(pascalName),
      [`application/dtos/${moduleName}.response.dto.ts`]:
        responseDtoTemplate(pascalName),
      [`application/interfaces/${moduleName}.service.interface.ts`]:
        serviceInterfaceTemplate(pascalName),
      [`application/interfaces/${moduleName}.query-repo.interface.ts`]:
        queryRepoInterfaceTemplate(pascalName),
      [`application/services/${moduleName}.service.ts`]:
        serviceTemplate(pascalName),
      [`domain/entities/${moduleName}.entity.ts`]: entityTemplate(pascalName),
      [`domain/errors/${moduleName}-domain.error.ts`]: '',
      [`domain/repositories/${moduleName}.repo.interface.ts`]:
        repoInterfaceTemplate(pascalName),
      [`infrastructure/${moduleName}.repo.ts`]: '',
      [`api/${moduleName}.controller.ts`]: controllerTemplate(
        moduleName,
        pascalName,
      ),
      [`${moduleName}.module.ts`]: moduleTemplate(pascalName),
    };

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(baseDir, filePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
      console.log(pc.green(`Created: ${fullPath}`));
    }
    console.log(
      pc.cyan(`\nModule "${moduleName}" successfully created at ${baseDir}`),
    );

    const registered = await registerModuleInAppModule(moduleName, pascalName);
    if (registered) {
      console.log(pc.green(`Registered ${pascalName}Module in app.module.ts`));
    } else {
      console.log(
        pc.yellow(
          `\nCould not auto-register the module. Add to src/app.module.ts by hand:\n` +
            `  import { ${pascalName}Module } from './modules/${moduleName}/${moduleName}.module';\n` +
            `  and add ${pascalName}Module to the imports: [...] array.\n` +
            `A module not present in AppModule.imports compiles fine and fails at boot — see CLAUDE.md.`,
        ),
      );
    }

    console.log(
      pc.yellow(
        `\nNothing is wired yet — every generated file is an empty shell:\n` +
          `  - Fill in the service/repo interfaces, entity, and domain errors.\n` +
          `  - Have ${pascalName}Repository (infrastructure/) implement both ` +
          `${moduleName}.repo.interface.ts and ${moduleName}.query-repo.interface.ts.\n` +
          `  - Wire controllers/providers/exports in ${moduleName}.module.ts ` +
          `(dual-token repo binding + service binding — see board.module.ts).\n` +
          `  - Add a Prisma model in prisma/models/${moduleName}.prisma, then npx prisma migrate dev.`,
      ),
    );
  });

async function checkExistDir(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

function toPascalCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

/**
 * Inserts the new module's import and its entry in `imports: [...]`, right
 * after the last bare `XyzModule,` line — the same spot every existing
 * feature module sits in src/app.module.ts. Fails closed: if either anchor
 * isn't found (the file was restructured since this was written), nothing is
 * written and the caller prints manual instructions instead of guessing.
 */
async function registerModuleInAppModule(
  moduleName: string,
  pascalName: string,
): Promise<boolean> {
  const appModulePath = join('src', 'app.module.ts');
  let content: string;
  try {
    content = await readFile(appModulePath, 'utf-8');
  } catch {
    return false;
  }

  if (new RegExp(`\\b${pascalName}Module\\b`).test(content)) {
    return true; // already registered — nothing to do
  }

  const importLine = `import { ${pascalName}Module } from './modules/${moduleName}/${moduleName}.module';\n`;
  const moduleImportPattern =
    /^import \{ \w+Module \} from '\.\/modules\/[\w-]+\/[\w-]+\.module';\n/gm;
  const lastImport = [...content.matchAll(moduleImportPattern)].pop();
  if (!lastImport || lastImport.index === undefined) {
    return false;
  }
  const afterLastImport = lastImport.index + lastImport[0].length;
  content =
    content.slice(0, afterLastImport) +
    importLine +
    content.slice(afterLastImport);

  const bareEntryPattern = /^(\s*)(\w+Module),\s*$/gm;
  const lastEntry = [...content.matchAll(bareEntryPattern)].pop();
  if (!lastEntry || lastEntry.index === undefined) {
    return false;
  }
  const indent = lastEntry[1];
  const insertAt = lastEntry.index + lastEntry[0].length;
  content =
    content.slice(0, insertAt) +
    `\n${indent}${pascalName}Module,` +
    content.slice(insertAt);

  await writeFile(appModulePath, content);
  return true;
}

// ---- templates ----
// Paths and filenames mirror src/modules/board/ (CLAUDE.md's designated
// reference module) — no `I` prefix on interface FILE names (only on the
// exported class), `.service.interface.ts` / `.query-repo.interface.ts` /
// `.repo.interface.ts` / `-domain.error.ts` suffixes. Content is deliberately
// empty shells; filling them in is a separate, per-feature step.

function requestDtoTemplate(pascalName: string): string {
  return `export class Create${pascalName}RequestDto {}

export class Update${pascalName}RequestDto {}
`;
}

function responseDtoTemplate(pascalName: string): string {
  return `export type ${pascalName}ResponseDto = {
  publicId: string;
};
`;
}

function serviceInterfaceTemplate(pascalName: string): string {
  return `export abstract class I${pascalName}Service {}
`;
}

function repoInterfaceTemplate(pascalName: string): string {
  return `export abstract class I${pascalName}Repository {}
`;
}

function queryRepoInterfaceTemplate(pascalName: string): string {
  return `export abstract class I${pascalName}QueryRepository {}
`;
}

function entityTemplate(pascalName: string): string {
  return `export class ${pascalName} {}
`;
}

function serviceTemplate(pascalName: string): string {
  return `import { Injectable } from '@nestjs/common';

@Injectable()
export class ${pascalName}Service {}
`;
}

function controllerTemplate(name: string, pascalName: string): string {
  return `import { Controller } from '@nestjs/common';

@Controller('${name}')
export class ${pascalName}Controller {}
`;
}

function moduleTemplate(pascalName: string): string {
  return `import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class ${pascalName}Module {}
`;
}

program.parse();
