import Keycloak, { type KeycloakProfile } from "keycloak-js";
import { keycloakConfig } from "../config";

// null when Keycloak is not configured for this build (guest-only mode).
export const keycloak = keycloakConfig ? new Keycloak(keycloakConfig) : null;

export type UserProfile = KeycloakProfile & {
  username?: string;
};
