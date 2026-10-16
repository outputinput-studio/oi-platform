import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

/**
 * The catalogue, end to end: a category, a product with a photo, a price
 * and a sale price, made to order, made visible; then the shop, its
 * category page and the product page on the storefront, in the site's
 * currency.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const demo = base.replace("127.0.0.1", "demo.localhost");
const fixture = path.join(__dirname, "fixtures", "shop-front.png");

test.use({ viewport: { width: 1200, height: 900 } });

async function signInAsOwner(page: Page) {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  const code = await page.getByTestId("dev-code").textContent();
  await page.getByLabel("Code").fill(code!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Demo site" }).click();
  await expect(page).toHaveURL(admin + "/");
}

test("a product from nothing to the shop", async ({ page, request }) => {
  await signInAsOwner(page);
  await goTo(page, "Products");
  await expect(page.getByText("Your products live here")).toBeVisible();

  // A category first.
  await page.getByRole("link", { name: /^Categories/ }).click();
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Name").fill("Bikinis");
  await expect(page.getByLabel("Address")).toHaveValue("bikinis");
  await page.getByLabel("Description").fill("Two pieces, crystals set by hand.");
  await page.getByRole("dialog").getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("category-bikinis")).toContainText("0 products");

  // Then the product, in it.
  await page.goto(admin + "/products");
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByLabel("Product name").fill("Teal crystal bikini");
  await page.getByLabel("Category").selectOption({ label: "Bikinis" });
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("heading", { name: "Edit product" })).toBeVisible();
  await expect(page.getByLabel("Web address")).toHaveValue("teal-crystal-bikini");
  const editorUrl = page.url();

  // A new category from inside the product: a sheet, picked straight away, still on the product.
  await page.getByRole("button", { name: "New category" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("One-piece");
  await page.getByRole("dialog").getByLabel("Description").fill("Swimsuits and leotards.");
  await page.getByRole("dialog").getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(page.url()).toBe(editorUrl);
  await expect(page.getByLabel("Category")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByLabel("Category").locator("option:checked")).toHaveText("One-piece");
  await expect(page.getByTestId("product-save-status")).toHaveText("✓ Saved");
  // Back to Bikinis for the rest.
  await page.getByLabel("Category").selectOption({ label: "Bikinis" });

  // A photo, uploaded from here, described.
  await page.getByRole("button", { name: "Add photo" }).click();
  await page.getByRole("dialog").getByLabel("Choose images to upload").setInputFiles(fixture);
  await expect(page.getByTestId("photos").locator("img")).toHaveCount(1);
  await page.getByLabel("Describe photo 1").fill("Teal crystals on stretch mesh");

  // Price, sale, made to order, visible.
  await page.getByLabel("Price", { exact: true }).fill("420");
  await page.getByLabel("Sale price").fill("abc");
  await expect(page.getByText(/A price is a number/)).toBeVisible();
  await page.getByLabel("Sale price").fill("380");
  await page.getByRole("radio", { name: "Made to order" }).click();
  await page.getByLabel("How long does it take to make?").fill("6");
  await page.getByLabel("Description").fill("Hand-set crystals on a teal base.\n\nMade to your measurements.");
  await expect(page.getByTestId("customer-view")).toContainText("$380");
  await expect(page.getByTestId("customer-view")).toContainText("$420");
  await expect(page.getByTestId("customer-view")).toContainText("Made to order — around 6 weeks");
  await expect(page.getByTestId("customer-view")).toContainText("Hidden");
  await page.getByRole("switch", { name: /Visible on site/ }).click();
  await expect(page.getByTestId("product-save-status")).toHaveText("✓ Saved");

  // The list shows it. Test payments are on here (no Stripe keys), so there's no "nothing can be bought" note.
  await page.goto(admin + "/products");
  await expect(page.getByTestId("no-checkout")).toHaveCount(0);
  await expect(page.getByTestId("product-teal-crystal-bikini")).toContainText("Made to order · 6 weeks");
  await expect(page.getByTestId("product-teal-crystal-bikini")).not.toContainText("Hidden");

  // The storefront: the shop, its category, the piece.
  await page.goto(demo + "/shop");
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
  await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Bikinis" }).click();
  await expect(page).toHaveURL(demo + "/shop/bikinis");
  await expect(page.getByText("Two pieces, crystals set by hand.")).toBeVisible();
  await page.getByRole("link", { name: /Teal crystal bikini/ }).click();
  await expect(page).toHaveURL(demo + "/shop/teal-crystal-bikini");
  await expect(page.getByRole("heading", { name: "Teal crystal bikini" })).toBeVisible();
  await expect(page.getByTestId("product-price")).toHaveText(/\$380\s*\$420/);
  await expect(page.getByTestId("product-note")).toHaveText("Made to order — around 6 weeks");
  await expect(page.getByRole("img", { name: "Teal crystals on stretch mesh" })).toBeVisible();
  const html = await (await request.get(base + "/shop/teal-crystal-bikini", { headers: { host: "demo.localhost" } })).text();
  expect(html).toContain('"@type":"Product"');
  expect(html).toContain('"priceCurrency":"AUD"');
  expect(html).toContain("https://schema.org/MadeToOrder");
  const sitemap = await (await request.get(base + "/sitemap.xml", { headers: { host: "demo.localhost" } })).text();
  expect(sitemap).toContain("/shop/teal-crystal-bikini");

  // Currency is a site setting: switch to baht and the shop follows; then back.
  await page.goto(admin + "/settings/shop");
  await page.getByLabel("Currency").selectOption("THB");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.goto(demo + "/shop/teal-crystal-bikini");
  await expect(page.getByTestId("product-price")).toContainText("฿380");
  await page.goto(admin + "/settings/shop");
  await page.getByLabel("Currency").selectOption("AUD");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});

test("buy it: cart, checkout, test payment, thank you", async ({ page }) => {
  await page.goto(demo + "/shop/teal-crystal-bikini");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Added — view your cart" }).click();
  await expect(page).toHaveURL(demo + "/shop/cart");
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await expect(page.getByTestId("cart-line-teal-crystal-bikini")).toContainText("$380");
  await expect(page.getByTestId("cart-total")).toHaveText("$380");
  await expect(page.getByText("Includes GST")).toBeVisible();

  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Name").fill("Dee Buyer");
  await page.getByLabel("Email").fill("dee@example.com");
  await page.getByLabel("Street address").fill("12 Rokeby Road");
  await page.getByLabel("Town or suburb").fill("Subiaco");
  await page.getByLabel("State").fill("WA");
  await page.getByLabel("Postcode").fill("6008");
  await expect(page.getByLabel("Country")).toHaveValue("AU");
  await page.getByRole("button", { name: "Continue to test payment" }).click();

  await expect(page).toHaveURL(/\/shop\/checkout\/pay\?order=/);
  await expect(page.getByText("no real money moves")).toBeVisible();
  await page.getByRole("button", { name: "Pay $380 (test)" }).click();
  await expect(page).toHaveURL(/\/shop\/checkout\/done\?order=/);
  await expect(page.getByTestId("done-heading")).toHaveText("Thank you, Dee");
  await expect(page.getByText("A receipt is on its way to dee@example.com.")).toBeVisible();
  // The cart empties once it's paid.
  await page.goto(demo + "/shop");
  await expect(page.getByTestId("cart-count")).toHaveCount(0);
});

test("the order reaches the team, and moves along", async ({ page }) => {
  await signInAsOwner(page);
  await expect(page.getByTestId("orders-badge").first()).toHaveText("1");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Orders", exact: true }).first().click();
  await expect(page.getByTestId("new-orders")).toHaveText("1 new order needs confirming");
  const row = page.getByTestId(/^order-\d+$/).first();
  await expect(row).toContainText("Dee Buyer");
  await expect(row).toContainText("Teal crystal bikini");
  await expect(row).toContainText("$380");
  await row.click();

  await expect(page.getByTestId("deliver-to")).toContainText("12 Rokeby Road");
  await expect(page.getByTestId("deliver-to")).toContainText("Australia");
  await expect(page.getByText("Test payment — no real money moved.")).toBeVisible();
  await expect(page.getByText("GST 10%")).toBeVisible();

  await page.getByRole("button", { name: "Mark as in progress" }).click();
  await expect(page.getByRole("dialog").getByLabel("Subject")).toHaveValue("I've started on your Teal crystal bikini");
  await page.getByRole("dialog").getByRole("button", { name: "Mark as in progress and email them" }).click();
  await expect(page.getByRole("button", { name: "Mark as sent" })).toBeVisible();

  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("dialog").getByLabel("Carrier").fill("Australia Post");
  await page.getByRole("dialog").getByLabel("Tracking number").fill("33ANJ482019");
  await expect(page.getByRole("dialog").getByLabel("Message")).toHaveValue(/Australia Post tracking: 33ANJ482019/);
  await page.getByRole("dialog").getByRole("button", { name: "Mark as sent and email them" }).click();
  await expect(page.getByRole("link", { name: "Track this parcel" })).toHaveAttribute("href", "https://auspost.com.au/mypost/track/details/33ANJ482019");
  await expect(page.getByTestId("orders-badge")).toHaveCount(0);
});

test("shipping: a zone with postage and a pickup, chosen at checkout", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/settings/shipping");
  await page.getByRole("button", { name: "+ Add a zone" }).click();
  const zone = page.getByTestId("zone-0");
  await expect(zone.getByLabel("Zone name")).toHaveValue("Australia");
  await zone.getByLabel("Price").fill("12");
  await zone.getByLabel("Delivery estimate").fill("3–5 business days");
  await zone.getByRole("button", { name: "Add a rate" }).click();
  await zone.getByRole("radio", { name: "Pick up" }).last().click();
  await zone.getByLabel("Name they see").last().fill("Pick up from the studio");
  await page.getByRole("button", { name: "Save shipping" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  await page.goto(demo + "/shop/teal-crystal-bikini");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Added — view your cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();

  // Cheapest first: the pickup, which needs no street address.
  const options = page.getByRole("radiogroup", { name: "How it gets to you" });
  await expect(options.getByRole("radio")).toHaveCount(2);
  await expect(options.getByText("Pick up from the studio")).toBeVisible();
  await expect(page.getByLabel("Street address")).toHaveCount(0);
  await expect(page.getByTestId("checkout-total")).toHaveText("$380");

  // Somewhere we don't send.
  await page.getByLabel("Country").selectOption("NZ");
  await expect(page.getByTestId("no-rates")).toContainText("New Zealand");
  await expect(page.getByRole("button", { name: "Continue to test payment" })).toBeDisabled();
  await expect(page.getByTestId("cant-continue")).toContainText("we don't send to New Zealand"); // said by the button, not just greyed
  await page.getByLabel("Country").selectOption("AU");

  // Posted instead.
  await options.getByText("Standard").click();
  await expect(page.getByTestId("checkout-total")).toHaveText("$392");
  await page.getByLabel("Name").fill("Sam Post");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByLabel("Street address").fill("1 Hay Street");
  await page.getByLabel("Town or suburb").fill("Perth");
  await page.getByLabel("Postcode").fill("6000");
  await page.getByRole("button", { name: "Continue to test payment" }).click();
  await page.getByRole("button", { name: "Pay $392 (test)" }).click();
  await expect(page.getByTestId("done-heading")).toHaveText("Thank you, Sam");
});

test("a discount code: made in the admin, used at checkout, counted", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/products");
  await page.getByRole("link", { name: /Discount codes/ }).click();
  await expect(page.getByText("No codes yet")).toBeVisible();
  await page.getByRole("link", { name: "Add code" }).click();
  await page.getByLabel("Code").fill("save10");
  await expect(page.getByLabel("Code")).toHaveValue("SAVE10");
  await page.getByRole("button", { name: "Save code" }).click();
  await expect(page).toHaveURL(/\/products\/discounts\/[0-9a-f-]{36}$/);
  await page.goto(admin + "/products/discounts");
  await expect(page.getByTestId("code-SAVE10")).toContainText("10% off everything");
  await expect(page.getByTestId("code-SAVE10")).toContainText("Active");

  await page.goto(demo + "/shop/teal-crystal-bikini");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Added — view your cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Discount code").fill("nope");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("NOPE isn't a code here.")).toBeVisible();
  await page.getByLabel("Discount code").fill("save10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("code-off")).toHaveText("−$38");
  await expect(page.getByTestId("checkout-total")).toHaveText("$342"); // picked up: no postage
  await page.getByLabel("Name").fill("Bec Code");
  await page.getByLabel("Email").fill("bec@example.com");
  await page.getByRole("button", { name: "Continue to test payment" }).click();
  await page.getByRole("button", { name: "Pay $342 (test)" }).click();
  await expect(page.getByTestId("done-heading")).toHaveText("Thank you, Bec");

  await page.goto(admin + "/products/discounts");
  await expect(page.getByTestId("code-SAVE10")).toContainText("1 used");
});

test("a refund from the order page, in part and then the rest", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/orders");
  await page.getByTestId(/^order-\d+$/).filter({ hasText: "Dee Buyer" }).click();
  await page.getByRole("button", { name: "Refund this order" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Amount")).toHaveValue("380");
  await sheet.getByLabel("Amount").fill("80");
  await sheet.getByRole("switch", { name: "Email the customer" }).click();
  await sheet.getByRole("button", { name: "Refund it" }).click();
  await expect(page.getByTestId("refunded")).toHaveText("−$80");
  await expect(page.getByText("Part refunded")).toBeVisible();

  await page.getByRole("button", { name: "Refund this order" }).click();
  await expect(sheet.getByLabel("Amount")).toHaveValue("300");
  await sheet.getByRole("button", { name: "Refund it" }).click();
  await expect(page.getByTestId("refunded")).toHaveText("−$380");
  await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible(); // the pill
  await expect(page.getByRole("button", { name: "Refund this order" })).toHaveCount(0);
});

test("enquiries: a zone quoted individually, then an enquire-only product", async ({ page }) => {
  await signInAsOwner(page);
  // The form enquiries go through.
  await goTo(page, "Content");
  await page.getByRole("navigation", { name: "Content" }).getByRole("link", { name: "Forms" }).click();
  await page.getByRole("button", { name: "Add form" }).click();
  await page.getByLabel("Form name").fill("Product enquiry");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+$/);
  await page.goto(admin + "/settings");
  await page.getByRole("link", { name: /Enquiries/ }).click();
  await page.getByRole("radio", { name: /Product enquiry/ }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Everywhere but Australia is quoted individually. Postcodes keep their commas as typed.
  await page.goto(admin + "/settings/shipping");
  await page.getByTestId("zone-0").getByRole("button", { name: /Australia/ }).click();
  await page.getByTestId("zone-0").getByRole("button", { name: "Add a rate" }).click();
  await page.getByTestId("zone-0").getByRole("radio", { name: "Local delivery" }).last().click();
  await page.getByTestId("zone-0").getByLabel("Postcodes you deliver to").fill("6000, 6008");
  await expect(page.getByTestId("zone-0").getByLabel("Postcodes you deliver to")).toHaveValue("6000, 6008");
  await page.getByRole("button", { name: "+ Add a zone" }).click();
  const row = page.getByTestId("zone-1");
  await row.getByRole("switch", { name: "Quote individually" }).click();
  await expect(row.getByText("Lands in your Inbox, not Orders.")).toBeVisible();
  await expect(row.getByText("Rates", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save shipping" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  await page.goto(demo + "/shop/teal-crystal-bikini");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Added — view your cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Country").selectOption("NZ");
  await expect(page.getByTestId("quote-note")).toContainText("We'll work out delivery to New Zealand and send you a quote.");
  await expect(page.getByLabel("Discount code")).toHaveCount(0);
  await page.getByLabel("Name").fill("Kiri Quote");
  await page.getByLabel("Email").fill("kiri@example.com");
  await page.getByLabel("Street address").fill("4 Ponsonby Road");
  await page.getByLabel("Town or suburb").fill("Auckland");
  await page.getByLabel("Postcode").fill("1011");
  await page.getByRole("button", { name: "Ask for a quote" }).click();
  await expect(page.getByTestId("quote-sent")).toContainText("Thanks, Kiri. We'll work out delivery to New Zealand");

  await page.goto(admin + "/inbox");
  await expect(page.getByTestId("submission").filter({ hasText: "Delivery quote to New Zealand" })).toContainText("Kiri Quote");

  // The bikini becomes enquire only: no cart, the enquiry form with it named.
  await page.goto(admin + "/products");
  await page.getByTestId("product-teal-crystal-bikini").click();
  await page.getByRole("radio", { name: /^Enquire only/ }).click();
  await expect(page.getByTestId("no-enquiry-form")).toHaveCount(0);
  await expect(page.getByText("Saved")).toBeVisible();
  await page.goto(demo + "/shop/teal-crystal-bikini");
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  await page.getByRole("button", { name: "Enquire about this" }).click();
  const form = page.getByTestId("enquiry");
  await form.getByLabel("Your name").fill("Amelia Frost");
  await form.getByLabel("Email").fill("amelia@example.com");
  await form.getByLabel("Your message").fill("Could it be in green?");
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByRole("status")).toBeVisible();

  await page.goto(admin + "/inbox");
  await page.getByTestId("submission").filter({ hasText: "Could it be in green?" }).click();
  await expect(page.getByText("Teal crystal bikini (/shop/teal-crystal-bikini)")).toBeVisible();
});

test("Email quote beside Add to cart, and the cart count only counts what can be bought", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/products");
  await page.getByTestId("product-teal-crystal-bikini").click();
  await page.getByRole("radio", { name: /^For sale/ }).click();
  await page.getByRole("radiogroup", { name: "How they buy it" }).getByRole("radio", { name: "Both" }).click();
  await expect(page.getByTestId("customer-view")).toContainText("Email quote");
  await expect(page.getByText("✓ Saved")).toBeVisible();

  await page.goto(demo + "/shop/teal-crystal-bikini");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: "Added — view your cart" })).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.getByRole("button", { name: "Email quote" }).click();
  const form = page.getByTestId("product-quote");
  await form.getByLabel("Name").fill("Sam Cold");
  await form.getByLabel("Email").fill("sam@example.com");
  await form.getByLabel("Country").selectOption("TH");
  await form.getByLabel("Postcode").fill("20130");
  await form.getByLabel("How many").fill("2");
  await form.getByRole("button", { name: "Send for a quote" }).click();
  await expect(page.getByTestId("product-quote-sent")).toContainText("We'll email a quote for Teal crystal bikini, delivered to Thailand");

  // Quote only: no cart for it, and the count in the header drops it straight away.
  await page.goto(admin + "/products");
  await page.getByTestId("product-teal-crystal-bikini").click();
  await page.getByRole("radiogroup", { name: "How they buy it" }).getByRole("radio", { name: "Email quote" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await page.goto(demo + "/shop/teal-crystal-bikini");
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Email quote" })).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveCount(0);
  await page.goto(demo + "/shop/cart");
  await expect(page.getByText("Teal crystal bikini is no longer available, so we took it out of your cart.")).toBeVisible();
  await expect(page.getByTestId("cart-tidied")).toBeAttached(); // the page tidies the cart cookie just after it shows
  await expect(page.getByText("Teal crystal bikini is no longer available")).toBeVisible(); // and the note stays put
  await page.goto(demo + "/shop/cart");
  await expect(page.getByText("no longer available")).toHaveCount(0); // it really was taken out
  await expect(page.getByText("Nothing in it yet.")).toBeVisible();

  await page.goto(admin + "/inbox");
  await expect(page.getByTestId("submission").filter({ hasText: "Quote for Teal crystal bikini" })).toContainText("Sam Cold");
});

test("order stages renamed, and how emails are sent", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/settings");
  await page.getByRole("link", { name: /Order statuses/ }).click();
  await page.getByLabel("Default: In progress").fill("Making it");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("save-bar")).toContainText("Saved");

  await page.goto(admin + "/orders");
  await expect(page.getByRole("link", { name: /^Making it/ })).toBeVisible();
  await page.getByTestId(/^order-\d+$/).filter({ hasText: "Sam Post" }).click();
  await expect(page.getByRole("button", { name: "Mark as making it" })).toBeVisible();

  await page.goto(admin + "/settings/sending");
  await page.getByLabel("Shown as from").fill("Demo Studio");
  await page.getByLabel("Replies go to").fill("hello@demo.example");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("save-bar")).toContainText("Saved");
  await page.goto(admin + "/settings");
  await expect(page.getByRole("link", { name: /Sending/ })).toContainText("From Demo Studio · replies to hello@demo.example");
});
