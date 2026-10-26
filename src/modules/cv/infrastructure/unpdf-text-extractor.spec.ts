import { extractText, getDocumentProxy } from 'unpdf';
import { UnpdfTextExtractor } from './unpdf-text-extractor';

jest.mock('unpdf', () => ({
  getDocumentProxy: jest.fn(),
  extractText: jest.fn(),
}));

describe('UnpdfTextExtractor', () => {
  const getProxy = getDocumentProxy as jest.Mock;
  const extract = extractText as jest.Mock;
  const extractor = new UnpdfTextExtractor();
  const pdf = new Uint8Array([37, 80, 68, 70]);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns the merged text of the document', async () => {
    getProxy.mockResolvedValue({ numPages: 2 });
    extract.mockResolvedValue({ totalPages: 2, text: 'Nguyen Van A' });

    const result = await extractor.extractTextAsync(pdf);

    expect(result._unsafeUnwrap()).toBe('Nguyen Van A');
    expect(extract).toHaveBeenCalledWith({ numPages: 2 }, { mergePages: true });
  });

  it('refuses a document with too many pages without reading it', async () => {
    getProxy.mockResolvedValue({ numPages: 21 });

    const result = await extractor.extractTextAsync(pdf);

    expect(result._unsafeUnwrapErr().message).toContain('too many pages');
    expect(extract).not.toHaveBeenCalled();
  });

  it('turns a broken or password-protected file into an error', async () => {
    getProxy.mockRejectedValue(new Error('InvalidPDFException'));

    const result = await extractor.extractTextAsync(pdf);

    expect(result._unsafeUnwrapErr().message).toBe('Failed to read the PDF.');
  });
});
