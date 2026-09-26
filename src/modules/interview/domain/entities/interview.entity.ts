export type InterviewSessionGetParams = {
  readonly id: number;
  readonly publicId: string;
  readonly userId: number;
  readonly cvId: number;
  readonly title: string;
  readonly jobDescription: string | null;
};

export class Interview {}
