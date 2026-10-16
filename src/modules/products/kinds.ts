/**
 * The fixed vocabularies of a product, on their own so the browser can
 * use them without pulling in the database schema.
 */
/** How a piece comes to exist: on the shelf, made when ordered, or the only one there is. */
export const PRODUCT_MAKES = ["ready", "madeToOrder", "oneOnly"] as const;
export type ProductMake = (typeof PRODUCT_MAKES)[number];
/** Whether it can be had: the team sets it, except sold out, which stock can set too. */
export const PRODUCT_AVAILABILITY = ["forSale", "sold", "soldOut", "enquire", "comingSoon"] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITY)[number];
/** How a customer gets it: the cart, a quote by email (priced by the team, e.g. for freight), or either. */
export const PRODUCT_BUY_WITH = ["cart", "quote", "both"] as const;
export type ProductBuyWith = (typeof PRODUCT_BUY_WITH)[number];
