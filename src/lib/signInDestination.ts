/** Only known internal destinations may be used after sign-in. */
export function signInDestination(search: string): string {
  return new URLSearchParams(search).get("next") === "ceramic-tiles" ? "/operations/ceramic-tiles" : "/dashboard";
}
export function signInPageFor(pathname: string): string {
  return pathname === "/operations/ceramic-tiles" ? "/login?next=ceramic-tiles" : "/login";
}
