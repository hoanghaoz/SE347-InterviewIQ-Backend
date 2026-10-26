import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { extractText, getDocumentProxy } from 'unpdf';
import { ICvTextExtractor } from '../application/interfaces/cv-text-extractor.interface';
import { MAX_CV_PAGES } from '../domain/parsing/cv-text';

@Injectable()
export class UnpdfTextExtractor implements ICvTextExtractor {
  private readonly logger = new Logger(UnpdfTextExtractor.name);

  async extractTextAsync(pdf: Uint8Array): Promise<Result<string, Error>> {
    try {
      const document = await getDocumentProxy(pdf);
      if (document.numPages > MAX_CV_PAGES) {
        return err(new Error('The PDF has too many pages to be a CV.'));
      }
      const { text } = await extractText(document, { mergePages: true });
      return ok(text);
    } catch (error) {
      this.logger.warn(
        `PDF text extraction failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      return err(new Error('Failed to read the PDF.'));
    }
  }
}
