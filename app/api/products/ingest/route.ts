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
        // Clean canonical URL and extract ASIN if Amazon URL
        let targetUrl = url;
        const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        if (asinMatch) {
            targetUrl = `https://www.amazon.com/dp/${asinMatch[1]}`;
            console.log(`[Product Ingest] Extracted ASIN ${asinMatch[1]}, fetching clean URL: ${targetUrl}`);
        }

        console.log(`[Product Ingest] Scraping URL: ${targetUrl}`);
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9"
            }
        });

        let html = "";
        if (res.ok) {
            html = await res.text();
        }

        const $ = cheerio.load(html || "<html></html>");

        // Extract title
        let name = $("#productTitle").text().trim() ||
                   $('meta[property="og:title"]').attr("content") || 
                   $('meta[name="twitter:title"]').attr("content") || 
                   $("h1").first().text().trim() ||
                   $("title").text() || 
                   "";

        name = name.trim()
            .replace(/^Amazon\.com\s*:\s*/i, "")
            .replace(/\s*:\s*Amazon\.com.*$/i, "")
            .replace(/\s*\|\s*Amazon.*$/i, "")
            .replace(/Robot Check/i, "")
            .trim();

        // Extract description
        let description = $('meta[property="og:description"]').attr("content") || 
                          $('meta[name="description"]').attr("content") || 
                          $("#feature-bullets").text().trim() ||
                          $(".product-description").text().trim() ||
                          "";
        description = description.replace(/\s+/g, " ").trim();

        // If title/description is generic ("Amazon" or empty), trigger DeepSeek AI Product Enrichment
        if (!name || name.toLowerCase() === "amazon" || name.toLowerCase().includes("scraped") || name.length < 4) {
            console.log(`[Product Ingest] Title is generic or robot-blocked. Calling DeepSeek AI product lookup for ASIN/URL...`);
            const deepseekKey = process.env.DEEPSEEK_API_KEY;
            if (deepseekKey) {
                try {
                    const aiRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${deepseekKey}`
                        },
                        body: JSON.stringify({
                            model: "deepseek-chat",
                            messages: [
                                {
                                    role: "system",
                                    content: "You are a product database parser. Given a product URL or Amazon ASIN code, output a clean JSON object with keys: name (string, concise real product title), brand (string), description (string, 2 sentences of features), price (string, e.g. '$29.99'), category (string). Return ONLY raw JSON without markdown codeblocks."
                                },
                                {
                                    role: "user",
                                    content: `Parse product details for URL: ${url} (ASIN: ${asinMatch ? asinMatch[1] : 'N/A'})`
                                }
                            ],
                            temperature: 0.2
                        })
                    });
                    if (aiRes.ok) {
                        const aiData = await aiRes.json();
                        const rawText = aiData.choices?.[0]?.message?.content?.trim() || "";
                        const jsonClean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
                        const parsed = JSON.parse(jsonClean);
                        if (parsed.name && parsed.name.length > 3) name = parsed.name;
                        if (parsed.description) description = parsed.description;
                    }
                } catch (aiErr: any) {
                    console.warn(`[Product Ingest] DeepSeek product enrichment failed:`, aiErr.message);
                }
            }
        }

        if (!name || name.length < 3) {
            name = asinMatch ? `Amazon Item ${asinMatch[1]}` : "Featured Product";
        }

        // Extract image
        const imageUrls: string[] = [];
        const ogImage = $('meta[property="og:image"]').attr("content") || 
                        $('meta[name="twitter:image"]').attr("content");
        if (ogImage && !ogImage.includes("captcha") && !ogImage.includes("logo")) {
            imageUrls.push(ogImage);
        } else {
            $("img").each((_, img) => {
                const src = $(img).attr("src");
                if (src && src.startsWith("http") && !src.includes("logo") && !src.includes("captcha") && imageUrls.length < 3) {
                    imageUrls.push(src);
                }
            });
        }

        // Extract price
        let price = $('meta[property="product:price:amount"]').attr("content") || 
                    $('meta[property="og:price:amount"]').attr("content") || 
                    "";
        if (!price) {
            const priceRegex = /\$\d+(?:\.\d{2})?/;
            const textMatch = html.match(priceRegex);
            if (textMatch) {
                price = textMatch[0];
            } else {
                price = "$29.99"; // Default price fallback
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
