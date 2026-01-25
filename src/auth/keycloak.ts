import Keycloak, { type KeycloakProfile } from "keycloak-js";

const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8080";
const keycloakRealm = import.meta.env.VITE_KEYCLOAK_REALM ?? "whiteboard";
const keycloakClientId =
  import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "whiteboard-ui";

export const keycloak = new Keycloak({
  url: keycloakUrl,
  realm: keycloakRealm,
  clientId: keycloakClientId
});

export type UserProfile = KeycloakProfile & {
  username?: string;
};