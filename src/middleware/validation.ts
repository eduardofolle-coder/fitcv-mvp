import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export function validateRequest(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const messages = error.details.map(d => d.message.replace(/"/g, ''));
      // El primer mensaje es el que se muestra en el formulario, así que debe
      // decir qué corregir en vez de un genérico "Validation error".
      return res.status(400).json({
        error: messages[0] || 'Validation error',
        details: messages
      });
    }

    req.body = value;
    next();
  };
}

// ✅ Schemas de validación reutilizables
export const schemas = {
  // Registro
  register: Joi.object({
    email: Joi.string()
      .email()
      .lowercase()
      .max(254)
      .required()
      .messages({'string.email': 'Invalid email format'}),
    password: Joi.string()
      .min(12)
      .max(128)
      .pattern(/[A-Z]/)
      .pattern(/[a-z]/)
      .pattern(/[0-9]/)
      .pattern(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 12 characters',
        'string.pattern.base': 'Password must include uppercase, lowercase, numbers, and symbols'
      })
  }),

  // Login
  login: Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().required()
  }),

  // CV upload
  cvUpload: Joi.object({
    fullName: Joi.string().max(255).optional(),
    email: Joi.string().email().optional()
  }),

  // Postulation
  postulation: Joi.object({
    // Offer ids are not UUIDs (seeded offers look like 'offer-001'), so accept
    // any safe slug/uuid shape rather than rejecting every real offer.
    offerId: Joi.string().max(64).pattern(/^[A-Za-z0-9_-]+$/).required()
      .messages({'string.pattern.base': 'Invalid offer id format'}),
    estado: Joi.string()
      .valid('Por revisar', 'Preparar postulación', 'Descartado', 'Aplicado', 'En revisión', 'Entrevista')
      .required(),
    prioridad: Joi.string()
      .valid('Alta', 'Media', 'Baja')
      .required(),
    notes: Joi.string().max(500).optional()
  })
};
