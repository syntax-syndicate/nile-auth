import { CookieOption, CookiesOptions, User } from "next-auth";
import { encode } from "next-auth/jwt";
import { maxAge } from "../../nextOptions";
import { jwt } from "@nile-auth/core/utils";
import {
  HEADER_ORIGIN,
  HEADER_SECURE_COOKIES,
  TENANT_COOKIE,
  X_NILE_ORIGIN,
  X_SECURE_COOKIES,
} from "./constants";

// this cookie does not go through next-auth
export function getPasswordResetCookie(
  useSecureCookies: boolean,
): CookieOption {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    name: `${cookiePrefix}nile.reset`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      "max-age": 14400, // 4 hours in seconds
    },
  };
}

export function getCallbackCookie(useSecureCookies: boolean): CookieOption {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    name: `${cookiePrefix}nile.callback-url`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  };
}

export function getCsrfTokenCookie(useSecureCookies: boolean): CookieOption {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    // Default to __Host- for CSRF token for additional protection if using useSecureCookies
    // NB: The `__Host-` prefix is stricter than the `__Secure-` prefix.
    name: `${cookiePrefix}nile.csrf-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  };
}

export function getSessionTokenCookie(useSecureCookies: boolean): CookieOption {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    name: `${cookiePrefix}nile.session-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  };
}

export function defaultCookies(
  useSecureCookies: boolean,
): Partial<CookiesOptions> {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    // default cookie options
    sessionToken: getSessionTokenCookie(useSecureCookies),
    callbackUrl: getCallbackCookie(useSecureCookies),
    csrfToken: getCsrfTokenCookie(useSecureCookies),
    pkceCodeVerifier: {
      name: `${cookiePrefix}nile.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes in seconds
      },
    },
    state: {
      name: `${cookiePrefix}nile.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes in seconds
      },
    },
    nonce: {
      name: `${cookiePrefix}nile.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    //@ts-expect-error taken from the docs, ts does not know about it
    webauthnChallenge: {
      name: `${cookiePrefix}nile.challenge`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes in seconds
      },
    },
  };
}

export function getSecureCookies(req: Request | Response): boolean {
  const headerSecureCookies = req.headers?.get(HEADER_SECURE_COOKIES);

  if (headerSecureCookies != null) {
    return headerSecureCookies === "true";
  }

  const secureCookies = req.headers?.get(X_SECURE_COOKIES);

  if (secureCookies != null) {
    return secureCookies === "true";
  }

  const origin = getOrigin(req);
  return Boolean(String(origin).startsWith("https://"));
}

export function getOrigin(req: Request | Response) {
  const realOrigin = req.headers?.get(HEADER_ORIGIN);
  if (realOrigin) {
    return realOrigin;
  }

  const origin = req.headers?.get(X_NILE_ORIGIN);
  if (origin) {
    return origin;
  }

  // in the case of a redirect, it is in `headers.location`
  const location = req.headers?.get("location");
  if (location) {
    return new URL(location).origin;
  }
  return new URL(req.url).origin;
}
export function getCookie(cookieKey: void | string, headers: void | Headers) {
  const cookie = headers?.get("cookie")?.split("; ");
  const _cookies: Record<string, string> = {};
  if (cookie) {
    for (const parts of cookie) {
      const cookieParts = parts.split("=");
      const _cookie = cookieParts.slice(1).join("=");
      const name = cookieParts[0];
      if (name) {
        _cookies[name] = _cookie;
      }
    }
  }

  if (cookieKey) {
    return _cookies[cookieKey];
  }
  return null;
}

export function getTenantCookie(req: Request) {
  const cookie = getCookie(TENANT_COOKIE, req.headers);
  if (cookie) {
    if (isValidUUID(cookie)) {
      return cookie;
    }
  }
  return null;
}
export function setTenantCookie(req: Request, rows: Record<string, string>[]) {
  if (!getCookie(TENANT_COOKIE, req.headers)) {
    const headers = new Headers();
    if (rows[0]?.id) {
      headers.set(
        "set-cookie",
        `${TENANT_COOKIE}=${rows[0].id}; Path=/; SameSite=lax`,
      );
    }
    return headers;
  } else {
    // help the UI if a user is removed or cookies got changed poorly, doesn't actually auth anything.
    const cookie = getCookie(TENANT_COOKIE, req.headers);
    const exists = rows.some((r) => r.id === cookie);
    if (!exists) {
      const headers = new Headers();
      if (rows[0]?.id) {
        headers.set(
          "set-cookie",
          `${TENANT_COOKIE}=${rows[0].id}; Path=/; SameSite=lax`,
        );
      } else {
        // the user doesn't have a tenant for the tenants we know, so remove the cookie
        headers.set(
          "set-cookie",
          `${TENANT_COOKIE}=; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
        );
      }
      return headers;
    }
  }
}

export function findCallbackCookie(req: Request) {
  const useSecureCookies = getSecureCookies(req);
  return decodeURIComponent(
    String(getCookie(getCallbackCookie(useSecureCookies).name, req.headers)),
  ).replace(/\/$/, "");
}

export async function makeNewSessionJwt(req: Request, user: User) {
  const useSecureCookies = getSecureCookies(req);
  const sessionCookie = getSessionTokenCookie(useSecureCookies);
  let newToken = "";

  const defaultToken = {
    name: user.name,
    email: user.email,
    picture: user.image,
    sub: user.id?.toString(),
  };
  const token = await jwt({
    token: defaultToken,
    user: user as User,
    account: null, // not oauth
  });
  if (process.env.NEXTAUTH_SECRET) {
    // no salt for session cookie
    newToken = await encode({
      ...jwt,
      token,
      secret: process.env.NEXTAUTH_SECRET,
    });
  }

  // Set cookie expiry date
  const cookieExpires = new Date();
  cookieExpires.setTime(cookieExpires.getTime() + maxAge * 1000);
  // update the session token
  const cookie = `${sessionCookie.name}=${newToken}; ${Object.keys(
    sessionCookie.options,
  )
    .map((key: string) => {
      return `${key}=${sessionCookie.options[key]}`;
    })
    .join("; ")}`;

  return cookie;
}
export { X_NILE_ORIGIN };

function isValidUUID(value: unknown): boolean {
  if (typeof value !== "string") return false;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
