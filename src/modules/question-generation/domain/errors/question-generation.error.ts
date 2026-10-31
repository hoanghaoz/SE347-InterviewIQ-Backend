export class QuestionSetLockedError extends Error {
  constructor() {
    super('Questions can only be generated while the session is CREATED');
  }
}
