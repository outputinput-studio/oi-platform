/**
 * Countries by ISO code, named in Australian English by the browser's own
 * list. Shipping zones and checkout addresses both use these codes.
 */
const CODES =
  "AU NZ TH SG MY ID PH VN JP KR CN HK TW IN US CA GB IE FR DE IT ES PT NL BE LU CH AT DK SE NO FI IS PL CZ SK HU RO BG GR HR SI EE LV LT MT CY AE SA QA KW BH OM IL TR ZA EG NG KE MA MX BR AR CL CO PE UY NC FJ PG WS TO VU KH LA MM BN MV LK BD NP PK".split(" ");

const names = new Intl.DisplayNames(["en-AU"], { type: "region" });

export const COUNTRIES: { code: string; name: string }[] = CODES.map((code) => ({ code, name: names.of(code) ?? code }));

export function countryName(code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRY_CODES = new Set(CODES);
