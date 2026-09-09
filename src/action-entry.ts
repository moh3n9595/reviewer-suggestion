import { appendFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runAction } from './action.js';
import { string } from './http.js';
import { errorCode } from './errors.js';

try {
  await runAction({
    input: (name) =>
      process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '',
    event: JSON.parse(
      await readFile(string(process.env.GITHUB_EVENT_PATH), 'utf8'),
    ) as unknown,
    output: async (name, value) => {
      const delimiter = randomUUID();
      await appendFile(
        string(process.env.GITHUB_OUTPUT),
        `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
      );
    },
    summary: async (value) => {
      await appendFile(string(process.env.GITHUB_STEP_SUMMARY), value);
    },
  });
} catch (error) {
  process.stderr.write(`Reviewer Action failed: ${errorCode(error)}\n`);
  process.exitCode = 1;
}
