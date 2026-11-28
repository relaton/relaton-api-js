// Side-effect module: registers the pubid identifier types the slug
// resolver (relaton#441) decodes slugs into. Since @pubid/pubid 0.1.70
// this is one import: register-types.js, the parg-free identifier-type
// manifest (pubid-ts#169). Before that, the per-flavor barrels were
// imported here — but each barrel reaches the central flavors barrel,
// which statically pulls nist/ieee and the node:fs parg runtime, so the
// set had to be hand-picked and oiml/nist/ieee slugs answered 404.
import "@pubid/pubid/dist/flavors/register-types.js";
