export class InterviewAnswerUnavailableError extends Error {
  constructor() {
    super('Interview question not found or unavailable');
  }
}

export class InterviewAnswerConflictError extends Error {
  constructor() {
    super('Answers cannot be changed in the current session state');
  }
}
