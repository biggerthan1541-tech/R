/*
 * Auth stub. Deliberately not a real auth system — see the non-goals in README.
 *
 * Everything downstream takes the actor as an argument rather than reaching for a
 * global, so replacing this with real sessions later is a change to this file plus
 * one middleware, not a change to the data layer.
 */

const STUB_ACTOR = {
  id: 'operator-1',
  email: process.env.OPERATOR_EMAIL ?? 'operator@msp.example',
  role: 'msp_operator',
};

export function currentActor(_req) {
  return STUB_ACTOR;
}

/*
 * Where real multi-tenancy will land: today an operator can see every client in the
 * local database. Later this returns the client ids the actor's MSP owns, and every
 * route already passes clientId into a tenant-scoped query.
 */
export function canAccessClient(_actor, _clientId) {
  return true;
}
