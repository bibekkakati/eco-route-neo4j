'use strict';

const { z } = require('zod');

/**
 * Returns Express middleware that validates req.body against a Zod schema.
 * On failure, responds 400 with a structured list of field errors.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body' | 'query' | 'params'} [source='body']
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const errors = issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        errors,
      });
    }

    // Replace with the parsed (and possibly coerced/defaulted) data
    req[source] = result.data;
    next();
  };
}

module.exports = { validate, z };
