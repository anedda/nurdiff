declare const __BUILD_DATE__: string;
declare const __GIT_COMMIT__: string;

/** Build date in ISO format (fixed by Vite at build time); empty if unknown. */
export const BUILD_DATE: string = typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "";

/** The commit it was built from, with "*" if there were uncommitted changes; empty if unknown. */
export const BUILD_COMMIT: string = typeof __GIT_COMMIT__ === "string" ? __GIT_COMMIT__ : "";

/** True with the development server (`tauri dev`, `npm run dev`), false in a build. */
export const BUILD_IS_DEV: boolean = import.meta.env.DEV;
