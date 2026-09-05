// Client half of the field contract served by GET /api/owner/settings-requirements.
//
// The rules themselves — which fields are mandatory, the pattern each value must match,
// the message shown when it doesn't, the options a dropdown offers, the length limits —
// all arrive from the server (config/storeSettings.config.js). Nothing in this file
// decides any of that; it only knows how to *apply* a rule, so the check that runs as an
// owner types is the same check the PATCH would run, worded the same way.
//
// Keep `fieldError` in step with validateField in that server module: they are deliberate
// twins, and a divergence shows up as a form that accepts what the API then rejects.

// Reads `address.city` out of { address: { city } }.
export function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// Immutably writes `address.city` into { address: { city } }, creating the branch if the
// form doesn't have it yet. The form state is shaped by these same paths, which is what
// lets one setter serve every input on the screen.
export function setByPath(obj, path, value) {
  const [head, ...rest] = path.split(".");
  if (rest.length === 0) return { ...obj, [head]: value };
  return { ...obj, [head]: setByPath(obj[head] ?? {}, rest.join("."), value) };
}

// Field descriptors keyed by path, plus the lookups every caller ends up wanting.
export function indexFields(fields = []) {
  const byPath = new Map(fields.map((f) => [f.path, f]));
  return {
    all: fields,
    get: (path) => byPath.get(path),
    // Labels and required markers come straight from the descriptor, so a field the
    // server hasn't described renders no marker rather than a wrong one.
    props: (path) => {
      const field = byPath.get(path);
      return { label: field?.label ?? "", required: !!field?.required, field };
    },
    section: (name) => fields.filter((f) => f.section === name),
    onCreate: () => fields.filter((f) => f.onCreate),
  };
}

// A stable DOM id per field, so a label's htmlFor and the focus-first-invalid jump on a
// failed save agree without either of them holding a list of ids.
export const inputId = (path) => `field-${path.replace(/\./g, "-")}`;

// One rule, one value, one message (or null). Mirrors validateField on the server.
export function fieldError(field, rawValue) {
  if (!field) return null;
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  const isEmpty =
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    return field.required ? field.requiredMessage ?? `${field.label} is required` : null;
  }

  if (field.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return `${field.label} must be a number`;
    if (field.integer && !Number.isInteger(n)) return `${field.label} must be a whole number`;
    if (field.min !== undefined && n < field.min) return `${field.label} must be ${field.min} or more`;
    if (field.max !== undefined && n > field.max) return `${field.label} must be ${field.max} or less`;
    return null;
  }

  if (typeof value !== "string") return null;

  if (field.minLength && value.length < field.minLength) {
    return `${field.label} must be at least ${field.minLength} characters`;
  }
  if (field.maxLength && value.length > field.maxLength) {
    return `${field.label} must be at most ${field.maxLength} characters`;
  }
  if (field.pattern && !new RegExp(field.pattern).test(value)) {
    return field.patternMessage ?? `Enter a valid ${field.label.toLowerCase()}`;
  }
  if (field.options && !field.options.includes(value)) {
    return `Choose a ${field.label.toLowerCase()} from the list`;
  }
  return null;
}

// Every rule in the spec, against a values object shaped the way the API expects it —
// i.e. the very payload the save is about to send, so what's validated is what's sent.
// Keyed by field path, which is also how the server reports its own field errors.
export function validateFields(fields, values) {
  const errors = {};
  for (const field of fields) {
    const message = fieldError(field, getByPath(values, field.path));
    if (message) errors[field.path] = message;
  }
  return errors;
}

// What an input is allowed to contain as it's typed — digits only, an upper-cased
// identifier, a hard length ceiling. Same descriptor, so a limit changes server-side and
// the keystroke handling follows.
export function applyInputRules(field, raw) {
  let next = raw;
  if (field?.digitsOnly) next = next.replace(/\D/g, "");
  if (field?.transform === "uppercase") next = next.toUpperCase();
  if (field?.maxLength) next = next.slice(0, field.maxLength);
  return next;
}

// A picked logo/banner, checked against the limits the upload middleware enforces before
// an upload round trip is spent discovering them.
export function brandImageError(limits, file) {
  if (!limits || !file) return null;
  if (limits.allowedMimeTypes?.length && !limits.allowedMimeTypes.includes(file.type)) {
    const names = limits.allowedMimeTypes.map((t) => t.split("/")[1].toUpperCase());
    return `Must be a ${names.join(", ")} image`;
  }
  if (limits.maxBytes && file.size > limits.maxBytes) {
    return `Must be under ${limits.maxSizeMB} MB`;
  }
  return null;
}
