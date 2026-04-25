import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodObject, ZodRawShape } from "zod";

type RequestSchema = AnyZodObject | ZodObject<ZodRawShape>;

export function validateRequest(schema: RequestSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    schema.parse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    next();
  };
}
