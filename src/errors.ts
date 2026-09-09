/** Typed operational or validation failure. Messages intentionally omit API bodies. */
export class ReviewerError extends Error {
  /** @param code Stable machine-readable failure code. @param message Safe diagnostic. */
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReviewerError';
  }
}
/** Converts arbitrary failures into a safe diagnostic code without leaking secrets. */
export function errorCode(error: unknown): string {
  return error instanceof ReviewerError ? error.code : 'UNEXPECTED_ERROR';
}
