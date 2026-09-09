import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
const documents = ['README.md', 'docs/README.md'];
const code = documents.flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/```ts\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  ),
);
const options = {
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  baseUrl: process.cwd(),
  paths: { 'reviewer-suggestion': ['src/index.ts'] },
};
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host);
const files = new Map(
  code.map((source, index) => [
    resolve(`examples/readme-${index}.mts`),
    source,
  ]),
);
host.readFile = (path) => files.get(path) ?? read(path);
const program = ts.createProgram([...files.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    `Compiled ${code.length} TypeScript examples from ${documents.join(' and ')}, including Consola compatibility.`,
  );
