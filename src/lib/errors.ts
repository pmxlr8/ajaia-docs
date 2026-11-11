import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = () =>
  new AppError(404, "not_found", "Document not found, or you do not have access to it.");
export const forbidden = (message: string) => new AppError(403, "forbidden", message);
export const badRequest = (message: string, code = "bad_request") => new AppError(400, code, message);

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
    return Response.json({ error: { code: "validation_error", message } }, { status: 400 });
  }
  if (err instanceof SyntaxError) {
    return Response.json({ error: { code: "invalid_json", message: "Request body is not valid JSON." } }, { status: 400 });
  }
  console.error(err);
  return Response.json({ error: { code: "internal", message: "Something went wrong on our side." } }, { status: 500 });
}

/** Wrap a route handler so thrown AppError / ZodError become clean JSON responses. */
export function route<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
