/**
 * Capitalize the first letter of a string.
 */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Convert a user story action string into a human-readable title.
 * e.g. "view user list" -> "View User List"
 */
export function storyActionToTitle(action: string): string {
  return action
    .split(/\s+/)
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Escape special regex characters for use inside RegExp literals in generated code.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Slugify a string for use in file names.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
