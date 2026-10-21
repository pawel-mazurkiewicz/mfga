// Loads data-net modules after registering the WP-A stand-in resolve hook (see wp-a-loader.mjs).
// Static imports would link before the hook exists, hence the dynamic imports.

import { register } from "node:module";

register("./wp-a-loader.mjs", import.meta.url);

const src = (file) => import(new URL(`../../../../src/data/${file}`, import.meta.url).href);

export const gql = await src("gql.js");
export const harvest = await src("harvest.js");
export const ops = await src("ops.js");
export const feedSource = await src("feed-source.js");
export const merge = await src("merge.js");
export const actions = await src("actions.js");
