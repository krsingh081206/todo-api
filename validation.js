// validation.js - Input validation module for Todo API request bodies
//
// Provides validation functions for create and update todo operations.
// Each function returns a structured result object:
//   { valid: boolean, errors: string[], data?: CreateTodoInput | UpdateTodoInput }
//
// Validation functions do not mutate the input parameter.

/**
 * @typedef {Object} CreateTodoInput
 * @property {string} title
 * @property {string|null} [description]  - optional
 */

/**
 * @typedef {Object} UpdateTodoInput
 * @property {string} [title]              - optional
 * @property {string|null} [description]   - optional
 * @property {boolean} [completed]         - optional
 */

/**
 * Validates the request body for creating a todo.
 *
 * Validation rules:
 * - title: required, must be a non-empty string, 1-255 characters
 * - description: optional, nullable, if a string must be max 1000 characters
 *
 * @param {unknown} body - The request body to validate
 * @returns {{ valid: boolean, errors: string[], data?: CreateTodoInput }}
 *   Result object with `valid` (true if all rules pass), `errors` (array of
 *   validation error messages, empty when valid), and `data` (the validated
 *   input, present only when valid is true).
 */
function validateCreateTodoInput(body) {
  const errors = [];

  // Check body exists and is a plain object
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: ['Request body must be a valid JSON object'] };
  }

  // Validate title (required, non-empty string, 1-255 characters)
  if (!('title' in body)) {
    errors.push('title is required');
  } else if (typeof body.title !== 'string') {
    errors.push('title must be a string');
  } else if (body.title.length === 0) {
    errors.push('title must not be empty');
  } else if (body.title.length > 255) {
    errors.push('title must be 1-255 characters');
  }

  // Validate description (optional, nullable, max 1000 characters)
  if ('description' in body && body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      errors.push('description must be a string or null');
    } else if (body.description.length > 1000) {
      errors.push('description must be at most 1000 characters');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated data without mutating input
  const data = { title: body.title };
  data.description =
    'description' in body && body.description !== undefined ? body.description : null;

  return { valid: true, errors: [], data };
}

/**
 * Validates the request body for updating a todo.
 *
 * Validation rules:
 * - At least one field must be provided (title, description, or completed)
 * - title: if provided, must be a non-empty string, 1-255 characters
 * - description: if provided, nullable, max 1000 characters
 * - completed: if provided, must be a boolean
 *
 * @param {unknown} body - The request body to validate
 * @returns {{ valid: boolean, errors: string[], data?: UpdateTodoInput }}
 *   Result object with `valid` (true if all rules pass), `errors` (array of
 *   validation error messages, empty when valid), and `data` (the validated
 *   input, present only when valid is true).
 */
function validateUpdateTodoInput(body) {
  const errors = [];

  // Check body exists and is a plain object
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: ['Request body must be a valid JSON object'] };
  }

  // Check that at least one of the updatable fields is present
  const hasTitle = 'title' in body;
  const hasDescription = 'description' in body;
  const hasCompleted = 'completed' in body;

  if (!hasTitle && !hasDescription && !hasCompleted) {
    errors.push('At least one field (title, description, or completed) must be provided');
  }

  // Validate title (if provided: non-empty string, 1-255 characters)
  if (hasTitle) {
    if (typeof body.title !== 'string') {
      errors.push('title must be a string');
    } else if (body.title.length === 0) {
      errors.push('title must not be empty');
    } else if (body.title.length > 255) {
      errors.push('title must be 1-255 characters');
    }
  }

  // Validate description (if provided: nullable, string max 1000 characters)
  if (hasDescription && body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      errors.push('description must be a string or null');
    } else if (body.description.length > 1000) {
      errors.push('description must be at most 1000 characters');
    }
  }

  // Validate completed (if provided: must be a boolean)
  if (hasCompleted) {
    if (typeof body.completed !== 'boolean') {
      errors.push('completed must be a boolean');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated data with only the fields present in the input
  const data = {};
  if (hasTitle) {
    data.title = body.title;
  }
  if (hasDescription) {
    data.description = body.description;
  }
  if (hasCompleted) {
    data.completed = body.completed;
  }

  return { valid: true, errors: [], data };
}

module.exports = { validateCreateTodoInput, validateUpdateTodoInput };
