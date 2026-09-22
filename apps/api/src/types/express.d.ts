import type { Company } from '@ai-support/shared';

declare global {
  namespace Express {
    interface Request {
      company: Company;
      rawBody?: string;
    }
  }
}
