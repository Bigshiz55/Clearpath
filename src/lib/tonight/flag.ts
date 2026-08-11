/**
 * THE MIGRATION SWITCH.
 *
 * The Tonight Machine is a new front door to the whole product, and the flow it
 * will eventually replace (`/app/taste-quiz`) works and is in use. So it ships
 * dark: the customer route exists, is fully built, and returns a 404 until
 * somebody deliberately turns it on.
 *
 * A SERVER VARIABLE, NOT `NEXT_PUBLIC_*`. A `NEXT_PUBLIC_` flag is inlined into
 * the client bundle at build time, so changing it means a rebuild and a
 * redeploy — which is exactly the wrong property for the switch you reach for
 * when something is going wrong. This is read at request time on the server, so
 * it can be flipped on or, more importantly, OFF from the hosting environment
 * without shipping anything.
 *
 * Off is the default everywhere, including preview. `/dev/tonight` remains the
 * unauthenticated harness for non-production testing, so nothing about
 * verifying this work requires the flag to be on for real users.
 */

/** Values that mean yes. Anything else, including unset, means no. */
const ON = new Set(['1', 'true', 'on', 'yes']);

export function tonightMachineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ON.has((env.TONIGHT_MACHINE ?? '').trim().toLowerCase());
}
