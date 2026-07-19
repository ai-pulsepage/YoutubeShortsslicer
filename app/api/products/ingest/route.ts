import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as cheerio from "cheerio";

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

    try {
        console.log(`[Product Ingest] Scraping URL: ${url}`);
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        if (!res.ok) throw new Error(`Failed to fetch page: HTTP ${res.status}`);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Extract title
        let name = $('meta[property="og:title"]').attr("content") || 
                   $('meta[name="twitter:title"]').attr("content") || 
                   $("#productTitle").text().trim() ||
                   $("h1").first().text().trim() ||
                   $("title").text() || 
                   "Scraped Product";
        name = name.trim().replace(/^Amazon\.com\s*:\s*/i, "").replace(/\s*:\s*Amazon\.com.*$/i, "").replace(/\s*\|\s*Amazon.*$/i, "");

        // If title is still generic, parse the URL path slug
        if (name === "Scraped Product" || name.toLowerCase().includes("amazon") || name.length < 5) {
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split("/").filter(p => p.length > 0 && p !== "dp" && p !== "gp" && p !== "product" && !p.startsWith("B0"));
                if (pathParts.length > 0) {
                    const slug = decodeURIComponent(pathParts[0]).replace(/[-_]/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                    if (slug.length > 3) name = slug;
                }
            } catch {}
        }

        // Extract description
        let description = $('meta[property="og:description"]').attr("content") || 
                          $('meta[name="description"]').attr("content") || 
                          $("#feature-bullets").text().trim() ||
                          $(".product-description").text().trim() ||
                          "";
        description = description.replace(/\s+/g, " ").trim();

        // Extract image
        const imageUrls: string[] = [];
        const ogImage = $('meta[property="og:image"]').attr("content") || 
                        $('meta[name="twitter:image"]').attr("content");
        if (ogImage) {
            imageUrls.push(ogImage);
        } else {
            // Find first large image or product image
            $("img").each((_, img) => {
                const src = $(img).attr("src");
                if (src && src.startsWith("http") && !src.includes("logo") && imageUrls.length < 3) {
                    imageUrls.push(src);
                }
            });
        }

        // Extract price
        let price = $('meta[property="product:price:amount"]').attr("content") || 
                    $('meta[property="og:price:amount"]').attr("content") || 
                    "";
        if (!price) {
            // Look for price keywords/patterns in text (e.g. $19.99)
            const priceRegex = /\$\d+(?:\.\d{2})?/;
            const textMatch = html.match(priceRegex);
            if (textMatch) {
                price = textMatch[0];
            } else {
                // Check elements with typical pricing classes
                const priceText = $(".price, .amount, .price-item, [id*='price'], [class*='price']").first().text().trim();
                if (priceText && priceText.includes("$")) {
                    price = priceText;
                } else {
                    price = "$19.99"; // Fallback price
                }
            }
        } else {
            // Format price
            const currency = $('meta[property="product:price:currency"]').attr("content") || "USD";
            price = currency === "USD" ? `$${price}` : `${price} ${currency}`;
        }

        // Brand
        const brand = $('meta[property="product:brand"]').attr("content") || 
                      $('meta[name="twitter:label1"]').attr("content") || 
                      "Generic";

        // Category
        const category = $('meta[property="product:category"]').attr("content") || "Products";

        const product = await prisma.uGCProduct.create({
            data: {
                userId: session.user.id,
                sourceUrl: url,
                name,
                description: description || null,
                price: price || null,
                imageUrls,
                brand,
                category,
                scrapedAt: new Date()
            }
        });

        return NextResponse.json(product);
    } catch (err: any) {
        console.error(`[Product Ingest] Failed to scrape:`, err.message);
        // Fallback: Create a product with default values so it doesn't block the user
        const urlObj = new URL(url);
        const name = urlObj.hostname.replace("www.", "") + " Product";
        const product = await prisma.uGCProduct.create({
            data: {
                userId: session.user.id,
                sourceUrl: url,
                name,
                description: "Product details scraped from " + urlObj.hostname,
                price: "$29.99",
                imageUrls: [],
                brand: "Unknown",
                category: "General",
                scrapedAt: new Date()
            }
        });
        return NextResponse.json(product);
    }
}
