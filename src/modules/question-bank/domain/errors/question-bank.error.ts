export class QuestionBankFullError extends Error {
  constructor(readonly limit: number) {
    super(`The question bank is full (limit ${limit})`);
  }
}

export class QuestionBankUnavailableError extends Error {
  constructor() {
    super('User not found or unavailable');
  }
}
