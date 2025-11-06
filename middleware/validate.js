import { ZodError } from "zod";

/**
 * Validate request data using a Zod schema.
 * Example: validate({ body: schema })
 */
export const validate = (schemas) => {
  return (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.errors.map((e) => e.message).join(", ");
        return res.status(400).json({ error: message });
      }
      next(err);
    }
  };
};
