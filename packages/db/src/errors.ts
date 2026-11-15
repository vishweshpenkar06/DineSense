export class DomainError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} not found`, 404, "not_found");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}
