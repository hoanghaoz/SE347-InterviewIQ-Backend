import { ValidationError } from 'class-validator';
import { mapValidationErrors } from './validation-error.mapper';

describe('mapValidationErrors', () => {
  it('maps constraints without exposing the rejected value', () => {
    const error: ValidationError = {
      property: 'email',
      value: 'invalid-email',
      constraints: {
        isEmail: 'Invalid email format',
        isNotEmpty: 'Email is required',
      },
    };

    expect(mapValidationErrors([error])).toEqual([
      {
        field: 'email',
        messages: ['Invalid email format', 'Email is required'],
      },
    ]);
  });

  it('builds paths for nested arrays', () => {
    const error: ValidationError = {
      property: 'questions',
      children: [
        {
          property: '0',
          children: [
            {
              property: 'content',
              constraints: {
                isNotEmpty: 'Question content is required',
              },
            },
          ],
        },
      ],
    };

    expect(mapValidationErrors([error])).toEqual([
      {
        field: 'questions[0].content',
        messages: ['Question content is required'],
      },
    ]);
  });
});
