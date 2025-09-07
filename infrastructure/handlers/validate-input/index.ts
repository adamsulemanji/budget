import { Context } from 'aws-lambda';

interface StepFunctionInput {
  userId: string;
  statementId: string;
  key: string;
  issuer: string;
  cardLast4: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  input: StepFunctionInput;
}

export const main = async (input: StepFunctionInput, context: Context): Promise<ValidationResult> => {
  try {
    // Validate required fields
    if (!input.userId || typeof input.userId !== 'string') {
      return {
        valid: false,
        error: 'userId is required and must be a string',
        input,
      };
    }

    if (!input.statementId || typeof input.statementId !== 'string') {
      return {
        valid: false,
        error: 'statementId is required and must be a string',
        input,
      };
    }

    if (!input.key || typeof input.key !== 'string') {
      return {
        valid: false,
        error: 'key is required and must be a string',
        input,
      };
    }

    if (!input.issuer || typeof input.issuer !== 'string') {
      return {
        valid: false,
        error: 'issuer is required and must be a string',
        input,
      };
    }

    if (!input.cardLast4 || typeof input.cardLast4 !== 'string') {
      return {
        valid: false,
        error: 'cardLast4 is required and must be a string',
        input,
      };
    }

    // Validate cardLast4 format (should be 4 digits)
    if (!/^\d{4}$/.test(input.cardLast4)) {
      return {
        valid: false,
        error: 'cardLast4 must be exactly 4 digits',
        input,
      };
    }

    // Validate key format (should be a valid S3 key)
    if (!input.key.startsWith('uploads/') || !input.key.endsWith('.pdf')) {
      return {
        valid: false,
        error: 'key must be a valid PDF file in uploads/ directory',
        input,
      };
    }

    // Validate userId format (should not contain special characters that could cause issues)
    if (!/^[a-zA-Z0-9_-]+$/.test(input.userId)) {
      return {
        valid: false,
        error: 'userId can only contain alphanumeric characters, underscores, and hyphens',
        input,
      };
    }

    return {
      valid: true,
      input,
    };
  } catch (error) {
    console.error('Error validating input:', error);
    return {
      valid: false,
      error: 'Internal validation error',
      input,
    };
  }
};
