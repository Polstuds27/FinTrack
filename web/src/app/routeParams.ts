/**
 * Route-parameter helpers shared by the routed editors.
 *
 * `/things/new` and `/things/:thingId/edit` are both served by the same editor
 * component, so `new` has to be recognised as "no id" rather than as an id that
 * happens to be spelled "new" — otherwise a create route would try to load a
 * record that doesn't exist.
 */
export function paramId(value: string | undefined): string | undefined {
  return value !== undefined && value !== "new" ? value : undefined;
}
