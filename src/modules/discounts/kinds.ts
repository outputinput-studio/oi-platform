/** Discount vocabularies, on their own so the browser can use them without the database schema. */
export const DISCOUNT_KINDS = ["percent", "amount", "freeShipping"] as const;
export const DISCOUNT_SCOPES = ["all", "category", "products"] as const;
