/* eslint-disable */

// Generated from schema/ietf-item.schema.json — do not edit; rerun `npm run generate`.

// Source: relaton/relaton lutaml-model definitions.

import { z } from "zod";



export type IetfItem = {
  "id"?: string | null;
  "schema_version"?: string | null;
  "fetched"?: string | null;
  "type"?: "article" | "book" | "booklet" | "manual" | "proceedings" | "presentation" | "thesis" | "techreport" | "standard" | "unpublished" | "map" | "electronic resource" | "audiovisual" | "film" | "video" | "boradcast" | "software" | "graphic_work" | "music" | "patent" | "inbook" | "incollection" | "inproceedings" | "journal" | "website" | "webresource" | "dataset" | "archival" | "social_media" | "alert" | "message" | "convesation" | "misc" | null;
  "formattedref"?: BibFormattedref;
  "title"?: BibTitle[];
  "source"?: BibUri[];
  "docidentifier"?: BibDocidentifier[];
  "docnumber"?: string | null;
  "date"?: BibDate[];
  "contributor"?: BibContributor[];
  "edition"?: BibEdition;
  "version"?: BibVersion[];
  "note"?: BibNote[];
  "language"?: string[];
  "locale"?: string[];
  "script"?: string[];
  "abstract"?: BibAbstract[];
  "status"?: BibStatus;
  "copyright"?: BibCopyright[];
  "relation"?: IetfRelation[];
  "series"?: BibSeries[];
  "medium"?: BibMedium;
  "place"?: BibPlace[];
  "price"?: BibPrice[];
  "extent"?: BibExtent[];
  "size"?: BibSize;
  "accesslocation"?: string[];
  "license"?: string[];
  "classification"?: BibDocidentifier[];
  "keyword"?: BibKeyword[];
  "validity"?: BibValidity;
  "depiction"?: BibDepiction[];
  "ext"?: IetfExt;
};

export const IetfItem: z.ZodType<IetfItem> = z.lazy(() =>
  z.object({
    "id": z.string().nullable().optional(),
    "schema_version": z.string().nullable().optional(),
    "fetched": z.string().nullable().optional(),
    "type": z.enum(["article", "book", "booklet", "manual", "proceedings", "presentation", "thesis", "techreport", "standard", "unpublished", "map", "electronic resource", "audiovisual", "film", "video", "boradcast", "software", "graphic_work", "music", "patent", "inbook", "incollection", "inproceedings", "journal", "website", "webresource", "dataset", "archival", "social_media", "alert", "message", "convesation", "misc"]).nullable().optional(),
    "formattedref": z.lazy(() => BibFormattedref).optional(),
    "title": z.array(z.lazy(() => BibTitle)).optional(),
    "source": z.array(z.lazy(() => BibUri)).optional(),
    "docidentifier": z.array(z.lazy(() => BibDocidentifier)).optional(),
    "docnumber": z.string().nullable().optional(),
    "date": z.array(z.lazy(() => BibDate)).optional(),
    "contributor": z.array(z.lazy(() => BibContributor)).optional(),
    "edition": z.lazy(() => BibEdition).optional(),
    "version": z.array(z.lazy(() => BibVersion)).optional(),
    "note": z.array(z.lazy(() => BibNote)).optional(),
    "language": z.array(z.string()).optional(),
    "locale": z.array(z.string()).optional(),
    "script": z.array(z.string()).optional(),
    "abstract": z.array(z.lazy(() => BibAbstract)).optional(),
    "status": z.lazy(() => BibStatus).optional(),
    "copyright": z.array(z.lazy(() => BibCopyright)).optional(),
    "relation": z.array(z.lazy(() => IetfRelation)).optional(),
    "series": z.array(z.lazy(() => BibSeries)).optional(),
    "medium": z.lazy(() => BibMedium).optional(),
    "place": z.array(z.lazy(() => BibPlace)).optional(),
    "price": z.array(z.lazy(() => BibPrice)).optional(),
    "extent": z.array(z.lazy(() => BibExtent)).optional(),
    "size": z.lazy(() => BibSize).optional(),
    "accesslocation": z.array(z.string()).optional(),
    "license": z.array(z.string()).optional(),
    "classification": z.array(z.lazy(() => BibDocidentifier)).optional(),
    "keyword": z.array(z.lazy(() => BibKeyword)).optional(),
    "validity": z.lazy(() => BibValidity).optional(),
    "depiction": z.array(z.lazy(() => BibDepiction)).optional(),
    "ext": z.lazy(() => IetfExt).optional()
  }).strict());

export type BibFormattedref = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
  "format"?: string | null;
};

export const BibFormattedref: z.ZodType<BibFormattedref> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "format": z.string().nullable().optional()
  }).strict());

export type BibTitle = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
  "type"?: string | null;
  "format"?: string | null;
};

export const BibTitle: z.ZodType<BibTitle> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "type": z.string().nullable().optional(),
    "format": z.string().nullable().optional()
  }).strict());

export type BibUri = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "type"?: string | null;
  "content"?: string | null;
};

export const BibUri: z.ZodType<BibUri> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "type": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibDocidentifier = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
  "type"?: string | null;
  "scope"?: string | null;
  "primary"?: boolean | null;
};

export const BibDocidentifier: z.ZodType<BibDocidentifier> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "type": z.string().nullable().optional(),
    "scope": z.string().nullable().optional(),
    "primary": z.boolean().nullable().optional()
  }).strict());

export type BibDate = {
  "type"?: "published" | "accessed" | "created" | "implemented" | "obsoleted" | "confirmed" | "updated" | "corrected" | "issued" | "transmitted" | "copied" | "unchanged" | "circulated" | "adapted" | "vote-started" | "vote-ended" | "announced" | "stable-until" | null;
  "text"?: string | null;
  "from"?: string | null;
  "to"?: string | null;
  "at"?: string | null;
};

export const BibDate: z.ZodType<BibDate> = z.lazy(() =>
  z.object({
    "type": z.enum(["published", "accessed", "created", "implemented", "obsoleted", "confirmed", "updated", "corrected", "issued", "transmitted", "copied", "unchanged", "circulated", "adapted", "vote-started", "vote-ended", "announced", "stable-until"]).nullable().optional(),
    "text": z.string().nullable().optional(),
    "from": z.string().nullable().optional(),
    "to": z.string().nullable().optional(),
    "at": z.string().nullable().optional()
  }).strict().superRefine((doc, ctx) => {
  const groups: string[][] = [["from","to"],["at"]];
  const d = doc as Record<string, unknown>;
  const present = (k: string) => {
    const v = d[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  };
  if (groups.filter((g) => g.some(present)).length > 1) {
    ctx.addIssue({ code: "custom", message: "at most one choice group may be present" });
  }
}));

export type BibContributor = {
  "role"?: BibContributorRole[];
  "person"?: BibPerson;
  "organization"?: BibOrganization;
};

export const BibContributor: z.ZodType<BibContributor> = z.lazy(() =>
  z.object({
    "role": z.array(z.lazy(() => BibContributorRole)).optional(),
    "person": z.lazy(() => BibPerson).optional(),
    "organization": z.lazy(() => BibOrganization).optional()
  }).strict().superRefine((doc, ctx) => {
  const groups: string[][] = [["person"],["organization"]];
  const d = doc as Record<string, unknown>;
  const present = (k: string) => {
    const v = d[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  };
  if (groups.filter((g) => g.some(present)).length > 1) {
    ctx.addIssue({ code: "custom", message: "at most one choice group may be present" });
  }
}));

export type BibContributorRole = {
  "type"?: "author" | "performer" | "publisher" | "editor" | "adapter" | "translator" | "distributor" | "reazer" | "owner" | "authorizer" | "enabler" | "subject" | null;
  "description"?: BibLocalizedMarkedUpString[];
};

export const BibContributorRole: z.ZodType<BibContributorRole> = z.lazy(() =>
  z.object({
    "type": z.enum(["author", "performer", "publisher", "editor", "adapter", "translator", "distributor", "reazer", "owner", "authorizer", "enabler", "subject"]).nullable().optional(),
    "description": z.array(z.lazy(() => BibLocalizedMarkedUpString)).optional()
  }).strict());

export type BibLocalizedMarkedUpString = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
};

export const BibLocalizedMarkedUpString: z.ZodType<BibLocalizedMarkedUpString> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibPerson = {
  "address"?: BibAddress[];
  "phone"?: BibPhone[];
  "email"?: string[];
  "uri"?: BibUri[];
  "name"?: BibFullName;
  "credential"?: string[];
  "affiliation"?: BibAffiliation[];
  "identifier"?: BibPersonIdentifier[];
};

export const BibPerson: z.ZodType<BibPerson> = z.lazy(() =>
  z.object({
    "address": z.array(z.lazy(() => BibAddress)).optional(),
    "phone": z.array(z.lazy(() => BibPhone)).optional(),
    "email": z.array(z.string()).optional(),
    "uri": z.array(z.lazy(() => BibUri)).optional(),
    "name": z.lazy(() => BibFullName).optional(),
    "credential": z.array(z.string()).optional(),
    "affiliation": z.array(z.lazy(() => BibAffiliation)).optional(),
    "identifier": z.array(z.lazy(() => BibPersonIdentifier)).optional()
  }).strict());

export type BibAddress = {
  "street"?: string[];
  "city"?: string | null;
  "state"?: string | null;
  "country"?: string | null;
  "postcode"?: string | null;
  "formatted_address"?: string | null;
};

export const BibAddress: z.ZodType<BibAddress> = z.lazy(() =>
  z.object({
    "street": z.array(z.string()).optional(),
    "city": z.string().nullable().optional(),
    "state": z.string().nullable().optional(),
    "country": z.string().nullable().optional(),
    "postcode": z.string().nullable().optional(),
    "formatted_address": z.string().nullable().optional()
  }).strict());

export type BibPhone = {
  "type"?: string | null;
  "content"?: string | null;
};

export const BibPhone: z.ZodType<BibPhone> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibFullName = {
  "abbreviation"?: BibLocalizedString;
  "prefix"?: BibLocalizedString[];
  "forename"?: BibFullNameTypeForename[];
  "formatted_initials"?: BibLocalizedString;
  "surname"?: BibLocalizedString;
  "addition"?: BibLocalizedString[];
  "completename"?: BibLocalizedString;
  "note"?: BibNote[];
  "variant"?: BibFullNameTypeVariant[];
};

export const BibFullName: z.ZodType<BibFullName> = z.lazy(() =>
  z.object({
    "abbreviation": z.lazy(() => BibLocalizedString).optional(),
    "prefix": z.array(z.lazy(() => BibLocalizedString)).optional(),
    "forename": z.array(z.lazy(() => BibFullNameTypeForename)).optional(),
    "formatted_initials": z.lazy(() => BibLocalizedString).optional(),
    "surname": z.lazy(() => BibLocalizedString).optional(),
    "addition": z.array(z.lazy(() => BibLocalizedString)).optional(),
    "completename": z.lazy(() => BibLocalizedString).optional(),
    "note": z.array(z.lazy(() => BibNote)).optional(),
    "variant": z.array(z.lazy(() => BibFullNameTypeVariant)).optional()
  }).strict());

export type BibLocalizedString = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
};

export const BibLocalizedString: z.ZodType<BibLocalizedString> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibFullNameTypeForename = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
  "initial"?: string | null;
};

export const BibFullNameTypeForename: z.ZodType<BibFullNameTypeForename> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "initial": z.string().nullable().optional()
  }).strict());

export type BibNote = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
  "type"?: string | null;
};

export const BibNote: z.ZodType<BibNote> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "type": z.string().nullable().optional()
  }).strict());

export type BibFullNameTypeVariant = {
  "abbreviation"?: BibLocalizedString;
  "prefix"?: BibLocalizedString[];
  "forename"?: BibFullNameTypeForename[];
  "formatted_initials"?: BibLocalizedString;
  "surname"?: BibLocalizedString;
  "addition"?: BibLocalizedString[];
  "completename"?: BibLocalizedString;
  "note"?: BibNote[];
  "variant"?: BibFullNameTypeVariant[];
  "type"?: string | null;
};

export const BibFullNameTypeVariant: z.ZodType<BibFullNameTypeVariant> = z.lazy(() =>
  z.object({
    "abbreviation": z.lazy(() => BibLocalizedString).optional(),
    "prefix": z.array(z.lazy(() => BibLocalizedString)).optional(),
    "forename": z.array(z.lazy(() => BibFullNameTypeForename)).optional(),
    "formatted_initials": z.lazy(() => BibLocalizedString).optional(),
    "surname": z.lazy(() => BibLocalizedString).optional(),
    "addition": z.array(z.lazy(() => BibLocalizedString)).optional(),
    "completename": z.lazy(() => BibLocalizedString).optional(),
    "note": z.array(z.lazy(() => BibNote)).optional(),
    "variant": z.array(z.lazy(() => BibFullNameTypeVariant)).optional(),
    "type": z.string().nullable().optional()
  }).strict());

export type BibAffiliation = {
  "name"?: BibLocalizedString;
  "description"?: BibLocalizedMarkedUpString[];
  "organization"?: BibOrganization;
};

export const BibAffiliation: z.ZodType<BibAffiliation> = z.lazy(() =>
  z.object({
    "name": z.lazy(() => BibLocalizedString).optional(),
    "description": z.array(z.lazy(() => BibLocalizedMarkedUpString)).optional(),
    "organization": z.lazy(() => BibOrganization).optional()
  }).strict());

export type BibOrganization = {
  "address"?: BibAddress[];
  "phone"?: BibPhone[];
  "email"?: string[];
  "uri"?: BibUri[];
  "name"?: BibTypedLocalizedString[];
  "subdivision"?: BibSubdivision[];
  "abbreviation"?: BibLocalizedString;
  "identifier"?: BibOrganizationTypeIdentifier[];
  "logo"?: BibLogo[];
};

export const BibOrganization: z.ZodType<BibOrganization> = z.lazy(() =>
  z.object({
    "address": z.array(z.lazy(() => BibAddress)).optional(),
    "phone": z.array(z.lazy(() => BibPhone)).optional(),
    "email": z.array(z.string()).optional(),
    "uri": z.array(z.lazy(() => BibUri)).optional(),
    "name": z.array(z.lazy(() => BibTypedLocalizedString)).optional(),
    "subdivision": z.array(z.lazy(() => BibSubdivision)).optional(),
    "abbreviation": z.lazy(() => BibLocalizedString).optional(),
    "identifier": z.array(z.lazy(() => BibOrganizationTypeIdentifier)).optional(),
    "logo": z.array(z.lazy(() => BibLogo)).optional()
  }).strict());

export type BibTypedLocalizedString = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
  "type"?: string | null;
};

export const BibTypedLocalizedString: z.ZodType<BibTypedLocalizedString> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "type": z.string().nullable().optional()
  }).strict());

export type BibSubdivision = {
  "address"?: BibAddress[];
  "phone"?: BibPhone[];
  "email"?: string[];
  "uri"?: BibUri[];
  "name"?: BibTypedLocalizedString[];
  "subdivision"?: BibSubdivision[];
  "abbreviation"?: BibLocalizedString;
  "identifier"?: BibOrganizationTypeIdentifier[];
  "logo"?: BibLogo[];
  "type"?: string | null;
  "subtype"?: string | null;
};

export const BibSubdivision: z.ZodType<BibSubdivision> = z.lazy(() =>
  z.object({
    "address": z.array(z.lazy(() => BibAddress)).optional(),
    "phone": z.array(z.lazy(() => BibPhone)).optional(),
    "email": z.array(z.string()).optional(),
    "uri": z.array(z.lazy(() => BibUri)).optional(),
    "name": z.array(z.lazy(() => BibTypedLocalizedString)).optional(),
    "subdivision": z.array(z.lazy(() => BibSubdivision)).optional(),
    "abbreviation": z.lazy(() => BibLocalizedString).optional(),
    "identifier": z.array(z.lazy(() => BibOrganizationTypeIdentifier)).optional(),
    "logo": z.array(z.lazy(() => BibLogo)).optional(),
    "type": z.string().nullable().optional(),
    "subtype": z.string().nullable().optional()
  }).strict());

export type BibOrganizationTypeIdentifier = {
  "type"?: string | null;
  "content"?: string | null;
};

export const BibOrganizationTypeIdentifier: z.ZodType<BibOrganizationTypeIdentifier> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibLogo = {
  "type"?: string | null;
  "image"?: BibImage;
};

export const BibLogo: z.ZodType<BibLogo> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "image": z.lazy(() => BibImage).optional()
  }).strict());

export type BibImage = {
  "id"?: string | null;
  "src"?: string | null;
  "mimetype"?: string | null;
  "filename"?: string | null;
  "width"?: string | null;
  "height"?: string | null;
  "alt"?: string | null;
  "title"?: string | null;
  "longdesc"?: string | null;
};

export const BibImage: z.ZodType<BibImage> = z.lazy(() =>
  z.object({
    "id": z.string().nullable().optional(),
    "src": z.string().nullable().optional(),
    "mimetype": z.string().nullable().optional(),
    "filename": z.string().nullable().optional(),
    "width": z.string().nullable().optional(),
    "height": z.string().nullable().optional(),
    "alt": z.string().nullable().optional(),
    "title": z.string().nullable().optional(),
    "longdesc": z.string().nullable().optional()
  }).strict());

export type BibPersonIdentifier = {
  "type"?: string | null;
  "content"?: string | null;
};

export const BibPersonIdentifier: z.ZodType<BibPersonIdentifier> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibEdition = {
  "number"?: string | null;
  "content"?: string | null;
};

export const BibEdition: z.ZodType<BibEdition> = z.lazy(() =>
  z.object({
    "number": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibVersion = {
  "type"?: string | null;
  "content"?: string | null;
  "revision_date"?: string | null;
  "draft"?: string | null;
};

export const BibVersion: z.ZodType<BibVersion> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "revision_date": z.string().nullable().optional(),
    "draft": z.string().nullable().optional()
  }).strict());

export type BibAbstract = {
  "language"?: string | null;
  "locale"?: string | null;
  "script"?: string | null;
  "content"?: string | null;
  "format"?: string | null;
};

export const BibAbstract: z.ZodType<BibAbstract> = z.lazy(() =>
  z.object({
    "language": z.string().nullable().optional(),
    "locale": z.string().nullable().optional(),
    "script": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "format": z.string().nullable().optional()
  }).strict());

export type BibStatus = {
  "stage"?: BibStatusStage;
  "substage"?: BibStatusStage;
  "iteration"?: string | null;
};

export const BibStatus: z.ZodType<BibStatus> = z.lazy(() =>
  z.object({
    "stage": z.lazy(() => BibStatusStage).optional(),
    "substage": z.lazy(() => BibStatusStage).optional(),
    "iteration": z.string().nullable().optional()
  }).strict());

export type BibStatusStage = {
  "abbreviation"?: string | null;
  "content"?: string | null;
};

export const BibStatusStage: z.ZodType<BibStatusStage> = z.lazy(() =>
  z.object({
    "abbreviation": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibCopyright = {
  "from"?: string | null;
  "to"?: string | null;
  "owner"?: BibContributionInfo[];
  "scope"?: string | null;
};

export const BibCopyright: z.ZodType<BibCopyright> = z.lazy(() =>
  z.object({
    "from": z.string().nullable().optional(),
    "to": z.string().nullable().optional(),
    "owner": z.array(z.lazy(() => BibContributionInfo)).optional(),
    "scope": z.string().nullable().optional()
  }).strict());

export type BibContributionInfo = {
  "person"?: BibPerson;
  "organization"?: BibOrganization;
};

export const BibContributionInfo: z.ZodType<BibContributionInfo> = z.lazy(() =>
  z.object({
    "person": z.lazy(() => BibPerson).optional(),
    "organization": z.lazy(() => BibOrganization).optional()
  }).strict().superRefine((doc, ctx) => {
  const groups: string[][] = [["person"],["organization"]];
  const d = doc as Record<string, unknown>;
  const present = (k: string) => {
    const v = d[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  };
  if (groups.filter((g) => g.some(present)).length > 1) {
    ctx.addIssue({ code: "custom", message: "at most one choice group may be present" });
  }
}));

export type IetfRelation = {
  "type"?: "includes" | "includedIn" | "hasPart" | "partOf" | "merges" | "mergedInto" | "splits" | "splitInto" | "instanceOf" | "hasInstance" | "exemplarOf" | "hasExemplar" | "manifestationOf" | "hasManifestation" | "reproductionOf" | "hasReproduction" | "reprintOf" | "hasReprint" | "expressionOf" | "hasExpression" | "translatedFrom" | "hasTranslation" | "arrangementOf" | "hasArrangement" | "abridgementOf" | "hasAbridgement" | "annotationOf" | "hasAnnotation" | "draftOf" | "hasDraft" | "predecessorDraftOf" | "hasPredecessorDraft" | "successorDraftOf" | "hasSuccessorDraft" | "editionOf" | "hasEdition" | "updates" | "updatedBy" | "derivedFrom" | "derives" | "describes" | "describedBy" | "catalogues" | "cataloguedBy" | "hasSuccessor" | "successorOf" | "adaptedFrom" | "hasAdaptation" | "adoptedFrom" | "adoptedAs" | "reviewOf" | "hasReview" | "commentaryOf" | "hasCommentary" | "related" | "hasComplement" | "complementOf" | "obsoletes" | "obsoletedBy" | "cites" | "isCitedIn" | null;
  "description"?: BibLocalizedMarkedUpString;
  "bibitem"?: IetfItemBase;
  "locality"?: BibLocality[];
  "locality_stack"?: BibLocalityStack[];
  "source_locality"?: BibLocality[];
  "source_locality_stack"?: BibSourceLocalityStack[];
};

export const IetfRelation: z.ZodType<IetfRelation> = z.lazy(() =>
  z.object({
    "type": z.enum(["includes", "includedIn", "hasPart", "partOf", "merges", "mergedInto", "splits", "splitInto", "instanceOf", "hasInstance", "exemplarOf", "hasExemplar", "manifestationOf", "hasManifestation", "reproductionOf", "hasReproduction", "reprintOf", "hasReprint", "expressionOf", "hasExpression", "translatedFrom", "hasTranslation", "arrangementOf", "hasArrangement", "abridgementOf", "hasAbridgement", "annotationOf", "hasAnnotation", "draftOf", "hasDraft", "predecessorDraftOf", "hasPredecessorDraft", "successorDraftOf", "hasSuccessorDraft", "editionOf", "hasEdition", "updates", "updatedBy", "derivedFrom", "derives", "describes", "describedBy", "catalogues", "cataloguedBy", "hasSuccessor", "successorOf", "adaptedFrom", "hasAdaptation", "adoptedFrom", "adoptedAs", "reviewOf", "hasReview", "commentaryOf", "hasCommentary", "related", "hasComplement", "complementOf", "obsoletes", "obsoletedBy", "cites", "isCitedIn"]).nullable().optional(),
    "description": z.lazy(() => BibLocalizedMarkedUpString).optional(),
    "bibitem": z.lazy(() => IetfItemBase).optional(),
    "locality": z.array(z.lazy(() => BibLocality)).optional(),
    "locality_stack": z.array(z.lazy(() => BibLocalityStack)).optional(),
    "source_locality": z.array(z.lazy(() => BibLocality)).optional(),
    "source_locality_stack": z.array(z.lazy(() => BibSourceLocalityStack)).optional()
  }).strict().superRefine((doc, ctx) => {
  const groups: string[][] = [["locality","locality_stack"],["source_locality","source_locality_stack"]];
  const d = doc as Record<string, unknown>;
  const present = (k: string) => {
    const v = d[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  };
  if (groups.filter((g) => g.some(present)).length > 1) {
    ctx.addIssue({ code: "custom", message: "at most one choice group may be present" });
  }
}));

export type IetfItemBase = {
  "type"?: "article" | "book" | "booklet" | "manual" | "proceedings" | "presentation" | "thesis" | "techreport" | "standard" | "unpublished" | "map" | "electronic resource" | "audiovisual" | "film" | "video" | "boradcast" | "software" | "graphic_work" | "music" | "patent" | "inbook" | "incollection" | "inproceedings" | "journal" | "website" | "webresource" | "dataset" | "archival" | "social_media" | "alert" | "message" | "convesation" | "misc" | null;
  "formattedref"?: BibFormattedref;
  "title"?: BibTitle[];
  "source"?: BibUri[];
  "docidentifier"?: BibDocidentifier[];
  "docnumber"?: string | null;
  "date"?: BibDate[];
  "contributor"?: BibContributor[];
  "edition"?: BibEdition;
  "version"?: BibVersion[];
  "note"?: BibNote[];
  "language"?: string[];
  "locale"?: string[];
  "script"?: string[];
  "abstract"?: BibAbstract[];
  "status"?: BibStatus;
  "copyright"?: BibCopyright[];
  "relation"?: BibRelation[];
  "series"?: BibSeries[];
  "medium"?: BibMedium;
  "place"?: BibPlace[];
  "price"?: BibPrice[];
  "extent"?: BibExtent[];
  "size"?: BibSize;
  "accesslocation"?: string[];
  "license"?: string[];
  "classification"?: BibDocidentifier[];
  "keyword"?: BibKeyword[];
  "validity"?: BibValidity;
  "depiction"?: BibDepiction[];
};

export const IetfItemBase: z.ZodType<IetfItemBase> = z.lazy(() =>
  z.object({
    "type": z.enum(["article", "book", "booklet", "manual", "proceedings", "presentation", "thesis", "techreport", "standard", "unpublished", "map", "electronic resource", "audiovisual", "film", "video", "boradcast", "software", "graphic_work", "music", "patent", "inbook", "incollection", "inproceedings", "journal", "website", "webresource", "dataset", "archival", "social_media", "alert", "message", "convesation", "misc"]).nullable().optional(),
    "formattedref": z.lazy(() => BibFormattedref).optional(),
    "title": z.array(z.lazy(() => BibTitle)).optional(),
    "source": z.array(z.lazy(() => BibUri)).optional(),
    "docidentifier": z.array(z.lazy(() => BibDocidentifier)).optional(),
    "docnumber": z.string().nullable().optional(),
    "date": z.array(z.lazy(() => BibDate)).optional(),
    "contributor": z.array(z.lazy(() => BibContributor)).optional(),
    "edition": z.lazy(() => BibEdition).optional(),
    "version": z.array(z.lazy(() => BibVersion)).optional(),
    "note": z.array(z.lazy(() => BibNote)).optional(),
    "language": z.array(z.string()).optional(),
    "locale": z.array(z.string()).optional(),
    "script": z.array(z.string()).optional(),
    "abstract": z.array(z.lazy(() => BibAbstract)).optional(),
    "status": z.lazy(() => BibStatus).optional(),
    "copyright": z.array(z.lazy(() => BibCopyright)).optional(),
    "relation": z.array(z.lazy(() => BibRelation)).optional(),
    "series": z.array(z.lazy(() => BibSeries)).optional(),
    "medium": z.lazy(() => BibMedium).optional(),
    "place": z.array(z.lazy(() => BibPlace)).optional(),
    "price": z.array(z.lazy(() => BibPrice)).optional(),
    "extent": z.array(z.lazy(() => BibExtent)).optional(),
    "size": z.lazy(() => BibSize).optional(),
    "accesslocation": z.array(z.string()).optional(),
    "license": z.array(z.string()).optional(),
    "classification": z.array(z.lazy(() => BibDocidentifier)).optional(),
    "keyword": z.array(z.lazy(() => BibKeyword)).optional(),
    "validity": z.lazy(() => BibValidity).optional(),
    "depiction": z.array(z.lazy(() => BibDepiction)).optional()
  }).strict());

export type BibRelation = {
  "type"?: "includes" | "includedIn" | "hasPart" | "partOf" | "merges" | "mergedInto" | "splits" | "splitInto" | "instanceOf" | "hasInstance" | "exemplarOf" | "hasExemplar" | "manifestationOf" | "hasManifestation" | "reproductionOf" | "hasReproduction" | "reprintOf" | "hasReprint" | "expressionOf" | "hasExpression" | "translatedFrom" | "hasTranslation" | "arrangementOf" | "hasArrangement" | "abridgementOf" | "hasAbridgement" | "annotationOf" | "hasAnnotation" | "draftOf" | "hasDraft" | "predecessorDraftOf" | "hasPredecessorDraft" | "successorDraftOf" | "hasSuccessorDraft" | "editionOf" | "hasEdition" | "updates" | "updatedBy" | "derivedFrom" | "derives" | "describes" | "describedBy" | "catalogues" | "cataloguedBy" | "hasSuccessor" | "successorOf" | "adaptedFrom" | "hasAdaptation" | "adoptedFrom" | "adoptedAs" | "reviewOf" | "hasReview" | "commentaryOf" | "hasCommentary" | "related" | "hasComplement" | "complementOf" | "obsoletes" | "obsoletedBy" | "cites" | "isCitedIn" | null;
  "description"?: BibLocalizedMarkedUpString;
  "bibitem"?: BibItemBase;
  "locality"?: BibLocality[];
  "locality_stack"?: BibLocalityStack[];
  "source_locality"?: BibLocality[];
  "source_locality_stack"?: BibSourceLocalityStack[];
};

export const BibRelation: z.ZodType<BibRelation> = z.lazy(() =>
  z.object({
    "type": z.enum(["includes", "includedIn", "hasPart", "partOf", "merges", "mergedInto", "splits", "splitInto", "instanceOf", "hasInstance", "exemplarOf", "hasExemplar", "manifestationOf", "hasManifestation", "reproductionOf", "hasReproduction", "reprintOf", "hasReprint", "expressionOf", "hasExpression", "translatedFrom", "hasTranslation", "arrangementOf", "hasArrangement", "abridgementOf", "hasAbridgement", "annotationOf", "hasAnnotation", "draftOf", "hasDraft", "predecessorDraftOf", "hasPredecessorDraft", "successorDraftOf", "hasSuccessorDraft", "editionOf", "hasEdition", "updates", "updatedBy", "derivedFrom", "derives", "describes", "describedBy", "catalogues", "cataloguedBy", "hasSuccessor", "successorOf", "adaptedFrom", "hasAdaptation", "adoptedFrom", "adoptedAs", "reviewOf", "hasReview", "commentaryOf", "hasCommentary", "related", "hasComplement", "complementOf", "obsoletes", "obsoletedBy", "cites", "isCitedIn"]).nullable().optional(),
    "description": z.lazy(() => BibLocalizedMarkedUpString).optional(),
    "bibitem": z.lazy(() => BibItemBase).optional(),
    "locality": z.array(z.lazy(() => BibLocality)).optional(),
    "locality_stack": z.array(z.lazy(() => BibLocalityStack)).optional(),
    "source_locality": z.array(z.lazy(() => BibLocality)).optional(),
    "source_locality_stack": z.array(z.lazy(() => BibSourceLocalityStack)).optional()
  }).strict().superRefine((doc, ctx) => {
  const groups: string[][] = [["locality","locality_stack"],["source_locality","source_locality_stack"]];
  const d = doc as Record<string, unknown>;
  const present = (k: string) => {
    const v = d[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  };
  if (groups.filter((g) => g.some(present)).length > 1) {
    ctx.addIssue({ code: "custom", message: "at most one choice group may be present" });
  }
}));

export type BibItemBase = {
  "type"?: "article" | "book" | "booklet" | "manual" | "proceedings" | "presentation" | "thesis" | "techreport" | "standard" | "unpublished" | "map" | "electronic resource" | "audiovisual" | "film" | "video" | "boradcast" | "software" | "graphic_work" | "music" | "patent" | "inbook" | "incollection" | "inproceedings" | "journal" | "website" | "webresource" | "dataset" | "archival" | "social_media" | "alert" | "message" | "convesation" | "misc" | null;
  "formattedref"?: BibFormattedref;
  "title"?: BibTitle[];
  "source"?: BibUri[];
  "docidentifier"?: BibDocidentifier[];
  "docnumber"?: string | null;
  "date"?: BibDate[];
  "contributor"?: BibContributor[];
  "edition"?: BibEdition;
  "version"?: BibVersion[];
  "note"?: BibNote[];
  "language"?: string[];
  "locale"?: string[];
  "script"?: string[];
  "abstract"?: BibAbstract[];
  "status"?: BibStatus;
  "copyright"?: BibCopyright[];
  "relation"?: BibRelation[];
  "series"?: BibSeries[];
  "medium"?: BibMedium;
  "place"?: BibPlace[];
  "price"?: BibPrice[];
  "extent"?: BibExtent[];
  "size"?: BibSize;
  "accesslocation"?: string[];
  "license"?: string[];
  "classification"?: BibDocidentifier[];
  "keyword"?: BibKeyword[];
  "validity"?: BibValidity;
  "depiction"?: BibDepiction[];
};

export const BibItemBase: z.ZodType<BibItemBase> = z.lazy(() =>
  z.object({
    "type": z.enum(["article", "book", "booklet", "manual", "proceedings", "presentation", "thesis", "techreport", "standard", "unpublished", "map", "electronic resource", "audiovisual", "film", "video", "boradcast", "software", "graphic_work", "music", "patent", "inbook", "incollection", "inproceedings", "journal", "website", "webresource", "dataset", "archival", "social_media", "alert", "message", "convesation", "misc"]).nullable().optional(),
    "formattedref": z.lazy(() => BibFormattedref).optional(),
    "title": z.array(z.lazy(() => BibTitle)).optional(),
    "source": z.array(z.lazy(() => BibUri)).optional(),
    "docidentifier": z.array(z.lazy(() => BibDocidentifier)).optional(),
    "docnumber": z.string().nullable().optional(),
    "date": z.array(z.lazy(() => BibDate)).optional(),
    "contributor": z.array(z.lazy(() => BibContributor)).optional(),
    "edition": z.lazy(() => BibEdition).optional(),
    "version": z.array(z.lazy(() => BibVersion)).optional(),
    "note": z.array(z.lazy(() => BibNote)).optional(),
    "language": z.array(z.string()).optional(),
    "locale": z.array(z.string()).optional(),
    "script": z.array(z.string()).optional(),
    "abstract": z.array(z.lazy(() => BibAbstract)).optional(),
    "status": z.lazy(() => BibStatus).optional(),
    "copyright": z.array(z.lazy(() => BibCopyright)).optional(),
    "relation": z.array(z.lazy(() => BibRelation)).optional(),
    "series": z.array(z.lazy(() => BibSeries)).optional(),
    "medium": z.lazy(() => BibMedium).optional(),
    "place": z.array(z.lazy(() => BibPlace)).optional(),
    "price": z.array(z.lazy(() => BibPrice)).optional(),
    "extent": z.array(z.lazy(() => BibExtent)).optional(),
    "size": z.lazy(() => BibSize).optional(),
    "accesslocation": z.array(z.string()).optional(),
    "license": z.array(z.string()).optional(),
    "classification": z.array(z.lazy(() => BibDocidentifier)).optional(),
    "keyword": z.array(z.lazy(() => BibKeyword)).optional(),
    "validity": z.lazy(() => BibValidity).optional(),
    "depiction": z.array(z.lazy(() => BibDepiction)).optional()
  }).strict());

export type BibSeries = {
  "type"?: "main" | "alt" | null;
  "formattedref"?: BibFormattedref;
  "title"?: BibTitle[];
  "place"?: BibPlace;
  "organization"?: string | null;
  "abbreviation"?: BibLocalizedString;
  "from"?: string | null;
  "to"?: string | null;
  "number"?: string | null;
  "partnumber"?: string | null;
  "run"?: string | null;
};

export const BibSeries: z.ZodType<BibSeries> = z.lazy(() =>
  z.object({
    "type": z.enum(["main", "alt"]).nullable().optional(),
    "formattedref": z.lazy(() => BibFormattedref).optional(),
    "title": z.array(z.lazy(() => BibTitle)).optional(),
    "place": z.lazy(() => BibPlace).optional(),
    "organization": z.string().nullable().optional(),
    "abbreviation": z.lazy(() => BibLocalizedString).optional(),
    "from": z.string().nullable().optional(),
    "to": z.string().nullable().optional(),
    "number": z.string().nullable().optional(),
    "partnumber": z.string().nullable().optional(),
    "run": z.string().nullable().optional()
  }).strict());

export type BibPlace = {
  "city"?: string | null;
  "region"?: BibPlaceRegionType[];
  "country"?: BibPlaceRegionType[];
  "formatted_place"?: string | null;
  "uri"?: BibUri;
};

export const BibPlace: z.ZodType<BibPlace> = z.lazy(() =>
  z.object({
    "city": z.string().nullable().optional(),
    "region": z.array(z.lazy(() => BibPlaceRegionType)).optional(),
    "country": z.array(z.lazy(() => BibPlaceRegionType)).optional(),
    "formatted_place": z.string().nullable().optional(),
    "uri": z.lazy(() => BibUri).optional()
  }).strict());

export type BibPlaceRegionType = {
  "iso"?: string | null;
  "recommended"?: boolean | null;
  "content"?: string | null;
};

export const BibPlaceRegionType: z.ZodType<BibPlaceRegionType> = z.lazy(() =>
  z.object({
    "iso": z.string().nullable().optional(),
    "recommended": z.boolean().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibMedium = {
  "content"?: string | null;
  "genre"?: string | null;
  "form"?: string | null;
  "carrier"?: string | null;
  "size"?: string | null;
  "scale"?: string | null;
};

export const BibMedium: z.ZodType<BibMedium> = z.lazy(() =>
  z.object({
    "content": z.string().nullable().optional(),
    "genre": z.string().nullable().optional(),
    "form": z.string().nullable().optional(),
    "carrier": z.string().nullable().optional(),
    "size": z.string().nullable().optional(),
    "scale": z.string().nullable().optional()
  }).strict());

export type BibPrice = {
  "currency"?: string | null;
  "content"?: string | null;
};

export const BibPrice: z.ZodType<BibPrice> = z.lazy(() =>
  z.object({
    "currency": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibExtent = {
  "locality"?: BibLocality[];
  "locality_stack"?: BibLocalityStack[];
};

export const BibExtent: z.ZodType<BibExtent> = z.lazy(() =>
  z.object({
    "locality": z.array(z.lazy(() => BibLocality)).optional(),
    "locality_stack": z.array(z.lazy(() => BibLocalityStack)).optional()
  }).strict().superRefine((doc, ctx) => {
  const groups: string[][] = [["locality"],["locality_stack"]];
  const d = doc as Record<string, unknown>;
  const present = (k: string) => {
    const v = d[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  };
  if (groups.filter((g) => g.some(present)).length > 1) {
    ctx.addIssue({ code: "custom", message: "at most one choice group may be present" });
  }
}));

export type BibLocality = {
  "type"?: string | null;
  "reference_from"?: string | null;
  "reference_to"?: string | null;
};

export const BibLocality: z.ZodType<BibLocality> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "reference_from": z.string().nullable().optional(),
    "reference_to": z.string().nullable().optional()
  }).strict());

export type BibLocalityStack = {
  "connective"?: "and" | "or" | "from" | "to" | null;
  "locality"?: BibLocality[];
};

export const BibLocalityStack: z.ZodType<BibLocalityStack> = z.lazy(() =>
  z.object({
    "connective": z.enum(["and", "or", "from", "to"]).nullable().optional(),
    "locality": z.array(z.lazy(() => BibLocality)).optional()
  }).strict());

export type BibSize = {
  "value"?: BibSizeValue[];
};

export const BibSize: z.ZodType<BibSize> = z.lazy(() =>
  z.object({
    "value": z.array(z.lazy(() => BibSizeValue)).optional()
  }).strict());

export type BibSizeValue = {
  "type"?: string | null;
  "content"?: string | null;
};

export const BibSizeValue: z.ZodType<BibSizeValue> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "content": z.string().nullable().optional()
  }).strict());

export type BibKeyword = {
  "vocab"?: BibLocalizedString;
  "taxon"?: BibLocalizedString[];
  "vocabid"?: BibKeywordVocabid[];
};

export const BibKeyword: z.ZodType<BibKeyword> = z.lazy(() =>
  z.object({
    "vocab": z.lazy(() => BibLocalizedString).optional(),
    "taxon": z.array(z.lazy(() => BibLocalizedString)).optional(),
    "vocabid": z.array(z.lazy(() => BibKeywordVocabid)).optional()
  }).strict());

export type BibKeywordVocabid = {
  "type"?: string | null;
  "uri"?: string | null;
  "code"?: string | null;
  "term"?: string | null;
};

export const BibKeywordVocabid: z.ZodType<BibKeywordVocabid> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "uri": z.string().nullable().optional(),
    "code": z.string().nullable().optional(),
    "term": z.string().nullable().optional()
  }).strict());

export type BibValidity = {
  "begins"?: string | null;
  "ends"?: string | null;
  "revision"?: string | null;
};

export const BibValidity: z.ZodType<BibValidity> = z.lazy(() =>
  z.object({
    "begins": z.string().nullable().optional(),
    "ends": z.string().nullable().optional(),
    "revision": z.string().nullable().optional()
  }).strict());

export type BibDepiction = {
  "scope"?: string | null;
  "type"?: string | null;
  "image"?: BibImage[];
};

export const BibDepiction: z.ZodType<BibDepiction> = z.lazy(() =>
  z.object({
    "scope": z.string().nullable().optional(),
    "type": z.string().nullable().optional(),
    "image": z.array(z.lazy(() => BibImage)).optional()
  }).strict());

export type BibSourceLocalityStack = {
  "connective"?: "and" | "or" | "from" | "to" | null;
  "source_locality"?: BibLocality[];
};

export const BibSourceLocalityStack: z.ZodType<BibSourceLocalityStack> = z.lazy(() =>
  z.object({
    "connective": z.enum(["and", "or", "from", "to"]).nullable().optional(),
    "source_locality": z.array(z.lazy(() => BibLocality)).optional()
  }).strict());

export type IetfExt = {
  "schema_version"?: string | null;
  "doctype"?: IetfDoctype;
  "subdoctype"?: string | null;
  "flavor"?: string | null;
  "ics"?: BibICS[];
  "structuredidentifier"?: BibStructuredIdentifier[];
  "area"?: ("apt" | "gen" | "int" | "ops" | "rtg" | "sec" | "tsv" | "Applications and Real-Time" | "General" | "Internet" | "Operations and Management" | "Routing" | "Security" | "Transport")[];
  "stream"?: "IAB" | "IETF" | "Independent" | "IRTF" | "Legacy" | "Editorial" | null;
  "ipr"?: string | null;
  "pi"?: IetfProcessingInstructions;
  "consensus"?: string | null;
  "index_include"?: string | null;
  "ipr_extract"?: string | null;
  "sort_refs"?: string | null;
  "sym_refs"?: string | null;
  "toc_include"?: string | null;
  "toc_depth"?: string | null;
  "show_on_front_page"?: string | null;
};

export const IetfExt: z.ZodType<IetfExt> = z.lazy(() =>
  z.object({
    "schema_version": z.string().nullable().optional(),
    "doctype": z.lazy(() => IetfDoctype).optional(),
    "subdoctype": z.string().nullable().optional(),
    "flavor": z.string().nullable().optional(),
    "ics": z.array(z.lazy(() => BibICS)).optional(),
    "structuredidentifier": z.array(z.lazy(() => BibStructuredIdentifier)).optional(),
    "area": z.array(z.enum(["apt", "gen", "int", "ops", "rtg", "sec", "tsv", "Applications and Real-Time", "General", "Internet", "Operations and Management", "Routing", "Security", "Transport"])).optional(),
    "stream": z.enum(["IAB", "IETF", "Independent", "IRTF", "Legacy", "Editorial"]).nullable().optional(),
    "ipr": z.string().nullable().optional(),
    "pi": z.lazy(() => IetfProcessingInstructions).optional(),
    "consensus": z.string().nullable().optional(),
    "index_include": z.string().nullable().optional(),
    "ipr_extract": z.string().nullable().optional(),
    "sort_refs": z.string().nullable().optional(),
    "sym_refs": z.string().nullable().optional(),
    "toc_include": z.string().nullable().optional(),
    "toc_depth": z.string().nullable().optional(),
    "show_on_front_page": z.string().nullable().optional()
  }).strict());

export type IetfDoctype = {
  "abbreviation"?: string | null;
  "content"?: string | null;
  "type"?: "rfc" | "internet-draft" | null;
};

export const IetfDoctype: z.ZodType<IetfDoctype> = z.lazy(() =>
  z.object({
    "abbreviation": z.string().nullable().optional(),
    "content": z.string().nullable().optional(),
    "type": z.enum(["rfc", "internet-draft"]).nullable().optional()
  }).strict());

export type BibICS = {
  "code"?: string | null;
  "text"?: string | null;
};

export const BibICS: z.ZodType<BibICS> = z.lazy(() =>
  z.object({
    "code": z.string().nullable().optional(),
    "text": z.string().nullable().optional()
  }).strict());

export type BibStructuredIdentifier = {
  "type"?: string | null;
  "agency"?: string[];
  "klass"?: string | null;
  "docnumber"?: string | null;
  "partnumber"?: string | null;
  "edition"?: string | null;
  "version"?: string | null;
  "supplementtype"?: string | null;
  "supplementnumber"?: string | null;
  "amendment"?: string | null;
  "corrigendum"?: string | null;
  "language"?: string | null;
  "year"?: string | null;
};

export const BibStructuredIdentifier: z.ZodType<BibStructuredIdentifier> = z.lazy(() =>
  z.object({
    "type": z.string().nullable().optional(),
    "agency": z.array(z.string()).optional(),
    "klass": z.string().nullable().optional(),
    "docnumber": z.string().nullable().optional(),
    "partnumber": z.string().nullable().optional(),
    "edition": z.string().nullable().optional(),
    "version": z.string().nullable().optional(),
    "supplementtype": z.string().nullable().optional(),
    "supplementnumber": z.string().nullable().optional(),
    "amendment": z.string().nullable().optional(),
    "corrigendum": z.string().nullable().optional(),
    "language": z.string().nullable().optional(),
    "year": z.string().nullable().optional()
  }).strict());

export type IetfProcessingInstructions = {
  "artworkdelimiter"?: string | null;
  "artworklines"?: string | null;
  "authorship"?: string | null;
  "autobreaks"?: string | null;
  "background"?: string | null;
  "colonspace"?: string | null;
  "comments"?: string | null;
  "docmapping"?: string | null;
  "editing"?: string | null;
  "emoticonic"?: string | null;
  "footer"?: string | null;
  "header"?: string | null;
  "inline"?: string | null;
  "iprnotified"?: string | null;
  "linkmailto"?: string | null;
  "linefile"?: string | null;
  "notedraftinprogress"?: string | null;
  "private"?: string | null;
  "refparent"?: string | null;
  "rfcedstyle"?: string | null;
  "slides"?: string | null;
  "text_list_symbols"?: string | null;
  "tocappendix"?: string | null;
  "tocindent"?: string | null;
  "tocnarrow"?: string | null;
  "tocompact"?: string | null;
  "topblock"?: string | null;
  "useobject"?: string | null;
  "strict"?: string | null;
  "compact"?: string | null;
  "subcompact"?: string | null;
  "tocinclude"?: string | null;
  "tocdepth"?: string | null;
  "symrefs"?: string | null;
  "sortrefs"?: string | null;
};

export const IetfProcessingInstructions: z.ZodType<IetfProcessingInstructions> = z.lazy(() =>
  z.object({
    "artworkdelimiter": z.string().nullable().optional(),
    "artworklines": z.string().nullable().optional(),
    "authorship": z.string().nullable().optional(),
    "autobreaks": z.string().nullable().optional(),
    "background": z.string().nullable().optional(),
    "colonspace": z.string().nullable().optional(),
    "comments": z.string().nullable().optional(),
    "docmapping": z.string().nullable().optional(),
    "editing": z.string().nullable().optional(),
    "emoticonic": z.string().nullable().optional(),
    "footer": z.string().nullable().optional(),
    "header": z.string().nullable().optional(),
    "inline": z.string().nullable().optional(),
    "iprnotified": z.string().nullable().optional(),
    "linkmailto": z.string().nullable().optional(),
    "linefile": z.string().nullable().optional(),
    "notedraftinprogress": z.string().nullable().optional(),
    "private": z.string().nullable().optional(),
    "refparent": z.string().nullable().optional(),
    "rfcedstyle": z.string().nullable().optional(),
    "slides": z.string().nullable().optional(),
    "text_list_symbols": z.string().nullable().optional(),
    "tocappendix": z.string().nullable().optional(),
    "tocindent": z.string().nullable().optional(),
    "tocnarrow": z.string().nullable().optional(),
    "tocompact": z.string().nullable().optional(),
    "topblock": z.string().nullable().optional(),
    "useobject": z.string().nullable().optional(),
    "strict": z.string().nullable().optional(),
    "compact": z.string().nullable().optional(),
    "subcompact": z.string().nullable().optional(),
    "tocinclude": z.string().nullable().optional(),
    "tocdepth": z.string().nullable().optional(),
    "symrefs": z.string().nullable().optional(),
    "sortrefs": z.string().nullable().optional()
  }).strict());
