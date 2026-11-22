export class QuestionSetLockedError extends Error {
  constructor() {
    super('Questions can only be generated while the session is CREATED');
  }
}

export class QuestionNotInSessionError extends Error {
  constructor() {
    super('Question not found in this session');
  }
}
