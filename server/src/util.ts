/** Error text safe to show a user, from anything a catch block can receive. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
