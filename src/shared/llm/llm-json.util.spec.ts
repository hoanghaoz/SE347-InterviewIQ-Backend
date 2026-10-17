import { parseJsonOutput } from './llm-json.util';

const fence = '```';

describe('parseJsonOutput', () => {
  it('parses a plain JSON object', () => {
    const result = parseJsonOutput('{"a":1}');

    expect(result._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('parses a JSON array', () => {
    expect(parseJsonOutput('[1,2]')._unsafeUnwrap()).toEqual([1, 2]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseJsonOutput('  \n{"a":1}\n ')._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a json code fence', () => {
    const text = `${fence}json\n{"a":1}\n${fence}`;

    expect(parseJsonOutput(text)._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a bare code fence', () => {
    const text = `${fence}\n{"a":1}\n${fence}`;

    expect(parseJsonOutput(text)._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('returns an error for text that is not JSON', () => {
    expect(parseJsonOutput('Here are your questions:').isErr()).toBe(true);
  });

  it('returns an error for an empty string', () => {
    expect(parseJsonOutput('').isErr()).toBe(true);
  });
});
