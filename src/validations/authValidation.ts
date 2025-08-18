import Joi from "joi";

export const registerSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const updateProfile = Joi.object({
  fullName: Joi.string().min(1).max(100).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().max(30).optional(),
  dateOfBirth: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(), // yyyy-mm-dd
  gender: Joi.string().valid("male", "female", "other", "prefer-not-to-say").optional(),
});
