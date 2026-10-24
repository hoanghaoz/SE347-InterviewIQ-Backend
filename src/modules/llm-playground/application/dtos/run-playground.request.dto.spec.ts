import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RunPlaygroundRequestDto } from './run-playground.request.dto';

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(RunPlaygroundRequestDto, {
    mode: 'text',
    provider: 'default',
    prompt: 'hello',
    ...overrides,
  });

describe('RunPlaygroundRequestDto', () => {
  it('accepts a minimal valid body', async () => {
    expect(await validate(build())).toHaveLength(0);
  });

  it('accepts every optional field', async () => {
    const dto = build({
      mode: 'json',
      provider: 'groq',
      systemPrompt: 'be brief',
      schema: '{"type":"object"}',
      temperature: 0.7,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an empty prompt', async () => {
    expect(await validate(build({ prompt: '' }))).not.toHaveLength(0);
  });

  it('rejects a prompt over 8000 characters', async () => {
    const errors = await validate(build({ prompt: 'a'.repeat(8001) }));

    expect(errors.map((e) => e.property)).toContain('prompt');
  });

  it('rejects a system prompt over 4000 characters', async () => {
    const errors = await validate(build({ systemPrompt: 'a'.repeat(4001) }));

    expect(errors.map((e) => e.property)).toContain('systemPrompt');
  });

  it('rejects a schema over 8000 characters', async () => {
    const errors = await validate(build({ schema: 'a'.repeat(8001) }));

    expect(errors.map((e) => e.property)).toContain('schema');
  });

  it('rejects an unknown provider', async () => {
    expect(await validate(build({ provider: 'openai' }))).not.toHaveLength(0);
  });

  it('rejects an unknown mode', async () => {
    expect(await validate(build({ mode: 'stream' }))).not.toHaveLength(0);
  });

  it('rejects a temperature above 2', async () => {
    expect(await validate(build({ temperature: 2.5 }))).not.toHaveLength(0);
  });
});
