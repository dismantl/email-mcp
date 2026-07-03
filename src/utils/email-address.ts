import { z } from 'zod';

/**
 * Recipient-safe email address schema.
 *
 * Validates an email address while emitting a JSON Schema `pattern` that
 * contains no regex lookaround. Strict tool-schema validators — notably
 * OpenAI's function-calling schema check, which is backed by the RE2 engine —
 * reject any `pattern` that uses lookaround or backreferences. Zod 4's default
 * `z.string().email()` emits exactly such a pattern
 * (`^(?!\.)(?!.*\.\.)…`), so advertising a recipient field that way makes every
 * model request carrying the tool fail with
 * "Invalid JSON schema: regex lookaround is not supported."
 *
 * `z.regexes.html5Email` is the WHATWG HTML5 `input[type=email]` regex —
 * non-capturing groups and character classes only, no lookaround — so it stays
 * RE2-safe. The paired test pins the emitted schema against a lookaround
 * regression.
 */
const emailAddress = z.string().regex(z.regexes.html5Email, 'Invalid email address');

export default emailAddress;
