// test/validation.test.js - Unit tests for validation.js module
const { validateCreateTodoInput, validateUpdateTodoInput } = require('../validation');

describe('validation.js', () => {
  describe('validateCreateTodoInput()', () => {
    it('should return valid=true for input with title only', () => {
      const input = { title: 'Buy groceries' };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ title: 'Buy groceries', description: null });
    });

    it('should return valid=true for input with title and description', () => {
      const input = { title: 'Buy groceries', description: 'Milk, eggs, bread' };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ title: 'Buy groceries', description: 'Milk, eggs, bread' });
    });

    it('should return valid=true for input with null description', () => {
      const input = { title: 'Buy groceries', description: null };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ title: 'Buy groceries', description: null });
    });

    it('should return valid=true for input with undefined description (not present)', () => {
      const input = { title: 'Buy groceries' };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data.description).toBe(null);
    });

    it('should return valid=false for null body', () => {
      const result = validateCreateTodoInput(null);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.data).toBeUndefined();
    });

    it('should return valid=false for undefined body', () => {
      const result = validateCreateTodoInput(undefined);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.data).toBeUndefined();
    });

    it('should return valid=false for missing title', () => {
      const input = { description: 'No title here' };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title is required');
    });

    it('should return valid=false for empty title', () => {
      const input = { title: '' };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must not be empty');
    });

    it('should return valid=false for title exceeding 255 characters', () => {
      const input = { title: 'a'.repeat(256) };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must be 1-255 characters');
    });

    it('should return valid=true for title exactly 255 characters', () => {
      const input = { title: 'a'.repeat(255) };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(true);
    });

    it('should return valid=false for title that is not a string (number)', () => {
      const input = { title: 123 };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must be a string');
    });

    it('should return valid=false for title that is not a string (boolean)', () => {
      const input = { title: true };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must be a string');
    });

    it('should return valid=false for title null', () => {
      const result = validateCreateTodoInput({ title: null });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must be a string');
    });

    it('should return valid=false for title explicitly undefined', () => {
      const result = validateCreateTodoInput({ title: undefined });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should treat explicitly undefined description as null', () => {
      const result = validateCreateTodoInput({ title: 'Test', description: undefined });

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ title: 'Test', description: null });
    });

    it('should report errors for both title and description when both are invalid', () => {
      const result = validateCreateTodoInput({ title: '', description: 'a'.repeat(1001) });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        'title must not be empty',
        'description must be at most 1000 characters',
      ]);
    });

    it('should return valid=false for description exceeding 1000 characters', () => {
      const input = { title: 'Test', description: 'a'.repeat(1001) };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description must be at most 1000 characters');
    });

    it('should return valid=true for description exactly 1000 characters', () => {
      const input = { title: 'Test', description: 'a'.repeat(1000) };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(true);
    });

    it('should return valid=false for description that is not a string or null (number)', () => {
      const input = { title: 'Test', description: 123 };
      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description must be a string or null');
    });

    it('should not mutate the input parameter', () => {
      const input = { title: 'Buy groceries', description: 'Milk' };
      const original = { ...input };

      validateCreateTodoInput(input);

      expect(input).toEqual(original);
    });

    it('should not throw or mutate a frozen input, and return data as a new object', () => {
      const input = Object.freeze({ title: 'Frozen' });
      const snapshot = structuredClone(input);

      const result = validateCreateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.data).not.toBe(input);
      expect(input).toEqual(snapshot);
    });

    it('should not mutate the input when description is undefined', () => {
      const input = { title: 'Buy groceries' };
      const original = { ...input };

      validateCreateTodoInput(input);

      expect(input).toEqual(original);
      expect('description' in input).toBe(false);
    });

    it('should return a result object with valid, errors, and data properties', () => {
      const result = validateCreateTodoInput({ title: 'Test' });

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('data');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.data).toBe('object');
    });

    it('should return errors array as empty when valid is true', () => {
      const result = validateCreateTodoInput({ title: 'Test' });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors array as non-empty when valid is false', () => {
      const result = validateCreateTodoInput({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not include data when valid is false', () => {
      const result = validateCreateTodoInput({});

      expect(result.valid).toBe(false);
      expect(result.data).toBeUndefined();
    });

    it('should return valid=false for array body', () => {
      const result = validateCreateTodoInput([1, 2, 3]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return valid=false for string body', () => {
      const result = validateCreateTodoInput('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return valid=false for number body', () => {
      const result = validateCreateTodoInput(42);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateUpdateTodoInput()', () => {
    it('should return valid=true for partial update with title only', () => {
      const input = { title: 'Updated title' };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ title: 'Updated title' });
    });

    it('should return valid=true for partial update with completed only (true)', () => {
      const input = { completed: true };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ completed: true });
    });

    it('should return valid=true for partial update with completed only (false)', () => {
      const input = { completed: false };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ completed: false });
    });

    it('should return valid=true for partial update with description only (string)', () => {
      const input = { description: 'New description' };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ description: 'New description' });
    });

    it('should return valid=true for partial update with description null', () => {
      const input = { description: null };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ description: null });
    });

    it('should return valid=true for full update with all three fields', () => {
      const input = { title: 'New title', description: 'New description', completed: true };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({
        title: 'New title',
        description: 'New description',
        completed: true,
      });
    });

    it('should return valid=true for title and completed only', () => {
      const input = { title: 'Partial', completed: false };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toEqual({ title: 'Partial', completed: false });
    });

    it('should return valid=false when all fields are absent (empty object)', () => {
      const input = {};
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'At least one field (title, description, or completed) must be provided'
      );
      expect(result.data).toBeUndefined();
    });

    it('should return valid=false for empty title', () => {
      const input = { title: '' };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must not be empty');
    });

    it('should return valid=false for title exceeding 255 characters', () => {
      const input = { title: 'a'.repeat(256) };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must be 1-255 characters');
    });

    it('should return valid=true for title exactly 255 characters', () => {
      const input = { title: 'a'.repeat(255) };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
    });

    it('should return valid=false for title that is not a string (number)', () => {
      const input = { title: 123 };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title must be a string');
    });

    it('should return valid=false for description that is not a string or null (number)', () => {
      const input = { description: 123 };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description must be a string or null');
    });

    it('should return valid=false for description exceeding 1000 characters', () => {
      const input = { description: 'a'.repeat(1001) };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description must be at most 1000 characters');
    });

    it('should return valid=true for description exactly 1000 characters', () => {
      const input = { description: 'a'.repeat(1000) };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
    });

    it('should return valid=false for completed that is not a boolean (string)', () => {
      const input = { completed: 'yes' };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('completed must be a boolean');
    });

    it('should return valid=false for completed that is not a boolean (number)', () => {
      const input = { completed: 1 };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('completed must be a boolean');
    });

    it('should return valid=false for null body', () => {
      const result = validateUpdateTodoInput(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request body must be a valid JSON object');
      expect(result.data).toBeUndefined();
    });

    it('should return valid=false for undefined body', () => {
      const result = validateUpdateTodoInput(undefined);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request body must be a valid JSON object');
      expect(result.data).toBeUndefined();
    });

    it('should return valid=false for array body', () => {
      const result = validateUpdateTodoInput([1, 2, 3]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return valid=false for string body', () => {
      const result = validateUpdateTodoInput('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return valid=false for number body', () => {
      const result = validateUpdateTodoInput(42);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not mutate the input parameter', () => {
      const input = { title: 'Updated', description: 'Desc', completed: true };
      const original = { ...input };

      validateUpdateTodoInput(input);

      expect(input).toEqual(original);
    });

    it('should not mutate the input with partial fields', () => {
      const input = { title: 'Only title' };
      const original = { ...input };

      validateUpdateTodoInput(input);

      expect(input).toEqual(original);
      expect('description' in input).toBe(false);
      expect('completed' in input).toBe(false);
    });

    it('should return a result object with valid, errors, and data properties when valid', () => {
      const result = validateUpdateTodoInput({ title: 'Test' });

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('data');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.data).toBe('object');
    });

    it('should return errors array as empty when valid is true', () => {
      const result = validateUpdateTodoInput({ completed: false });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors array as non-empty when valid is false', () => {
      const result = validateUpdateTodoInput({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not include data when valid is false', () => {
      const result = validateUpdateTodoInput({ title: '' });

      expect(result.valid).toBe(false);
      expect(result.data).toBeUndefined();
    });

    it('should only include provided fields in data', () => {
      const input = { title: 'Test title', completed: true };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ title: 'Test title', completed: true });
      expect(result.data).not.toHaveProperty('description');
    });

    it('should not throw or mutate a frozen input, and return data as a new object', () => {
      const input = Object.freeze({ title: 'Frozen', description: null, completed: true });
      const snapshot = structuredClone(input);

      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.data).not.toBe(input);
      expect(input).toEqual(snapshot);
    });

    it('should preserve null description in data', () => {
      const input = { description: null, completed: false };
      const result = validateUpdateTodoInput(input);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ description: null, completed: false });
    });
  });
});
