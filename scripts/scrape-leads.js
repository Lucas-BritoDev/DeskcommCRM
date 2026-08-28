#!/usr/bin/env node

/**
 * Scraper de Leads - Facebook Marketplace + OLX
 *
 * Busca anúncios de carros em Salvador/BA e envia leads para o CRM Localiza.
 *
 * Configuração:
 *   SUPABASE_URL=https://embvktizhhghyedcphok.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJhbGci... (service_role)
 *   ORG_ID=7e8ab2d5-4ebf-487b-a63c-3cfaf2311fb1
 *   CHANNEL_SESSION_ID=c9a44dd2-a0f9-4022-8001-7bacc947e025
 *   WHATSAPP_PHONE=5511926753226
 *
 * Uso:
 *   node scripts/scrape-leads.js              # roda ambos
 *   node scripts/scrape-leads.js facebook     # só Facebook
 *   node scripts/scrape-leads.js olx          # só OLX
 */

const { chromium } = require("playwright");

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || "https://embvktizhhghyedcphok.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtYnZrdGl6aGhnaHllZGNwaG9rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA3MjcxMywiZXhwIjoyMTAyNjQ4NzEzfQ.cLK8TUOCDDDs-BYCEStF329m4W43nCA22cVMmKQpxCQ";
const ORG_ID = process.env.ORG_ID || "7e8ab2d5-4ebf-487b-a63c-3cfaf2311fb1";
const CHANNEL_SESSION_ID = process.env.CHANNEL_SESSION_ID || "c9a44dd2-a0f9-4022-8001-7bacc947e025";
// Telefone do Lucas (atende Salvador/BA)
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE || "5511926753226";

// Termos de busca para carros em Salvador/BA
const SEARCH_TERMS = [
  "carros Salvador",
  "carros usados Salvador",
  "carros novos Salvador",
  "SUV Salvador",
  "sedan Salvador",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function supabaseQuery(table, params = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseInsert(table, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("duplicate")) return null; // já existe
    throw new Error(`Supabase INSERT ${table}: ${res.status} ${text}`);
  }
  return res.json();
}

function normalizePhone(phone) {
  if (!phone) return null;
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, "");
  // Formata para +55XXXXXXXXXXX
  if (digits.length === 11) return `+55${digits}`;
  if (digits.length === 12 && digits.startsWith("55")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("55")) return `+${digits}`;
  return `+55${digits.slice(-11)}`;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Facebook Marketplace ────────────────────────────────────────────────────

async function scrapeFacebook(page) {
  console.log("[Facebook] Iniciando scrape...");
  const leads = [];

  try {
    // Buscar carros em Salvador no Marketplace
    const url = "https://www.facebook.com/marketplace/?ref=bookmark";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(3000);

    // Verificar se precisa de login
    const loginCheck = await page.$('input[name="email"]');
    if (loginCheck) {
      console.log("[Facebook] Login necessário - pulando Facebook");
      console.log("[Facebook] Dica: Faça login manualmente no navegador primeiro");
      return leads;
    }

    // Aguardar listagens carregarem
    await page.waitForSelector('[data-testid="marketplace-feed-item"]', { timeout: 10000 }).catch(() => {});
    await delay(2000);

    // Scroll para carregar mais itens
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await delay(1500);
    }

    // Extrair listagens
    const listings = await page.evaluate(() => {
      const items = [];
      // Tenta diferentes seletores para itens do marketplace
      const selectors = [
        '[data-testid="marketplace-feed-item"]',
        '[role="article"]',
        ".x1lliihq",
      ];

      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          elements.forEach((el) => {
            const titleEl = el.querySelector("span.x1lliihq, h3, [data-testid='marketplace-item-title']");
            const priceEl = el.querySelector("span.x193n5vb, [data-testid='marketplace-item-price']");
            const locationEl = el.querySelector("span.x1cpbm8r, [data-testid='marketplace-item-location']");
            const linkEl = el.querySelector("a[href*='marketplace']");

            if (titleEl) {
              items.push({
                title: titleEl.textContent?.trim() || "",
                price: priceEl?.textContent?.trim() || "",
                location: locationEl?.textContent?.trim() || "",
                link: linkEl?.href || "",
              });
            }
          });
          break;
        }
      }
      return items;
    });

    console.log(`[Facebook] Encontrados ${listings.length} anúncios`);

    for (const item of listings) {
      // Tentar extrair telefone do título ou descrição
      const phoneMatch = (item.title + " " + item.price).match(/(\d{11})/);
      const phone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;

      leads.push({
        name: item.title.slice(0, 100),
        phone_number: phone,
        source: "facebook_marketplace",
        metadata: {
          price: item.price,
          location: item.location,
          link: item.link,
          scraped_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.error("[Facebook] Erro:", err.message);
  }

  return leads;
}

// ─── OLX ─────────────────────────────────────────────────────────────────────

async function scrapeOLX(page) {
  console.log("[OLX] Iniciando scrape...");
  const leads = [];

  try {
    // Buscar carros em Salvador
    const url = "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-ba/salvador";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(3000);

    // Verificar se há cookie banner e fechar
    const cookieBtn = await page.$('button[data-ds-component="Button"][type="button"]');
    if (cookieBtn) {
      const text = await cookieBtn.textContent();
      if (text?.includes("Aceitar") || text?.includes("aceitar")) {
        await cookieBtn.click();
        await delay(1000);
      }
    }

    // Scroll para carregar mais itens
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await delay(1500);
    }

    // Extrair listagens
    const listings = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('[data-ds-component="Card"],.olx-ad-card,section.ad-list__item,li[data-ds-component="Card"]');

      if (cards.length === 0) {
        // Fallback: tentar outros seletores
        document.querySelectorAll("a[href*='/d/']").forEach((el) => {
          const titleEl = el.querySelector("h2, span.ad__card-title, [data-ds-component='Text']");
          const priceEl = el.querySelector("[data-ds-component='Text'].ad__card-price, span.ad__card-price, h3");
          const locEl = el.querySelector("[data-ds-component='Text'].ad__card-location, span.ad__card-location, p");

          if (titleEl) {
            items.push({
              title: titleEl.textContent?.trim() || "",
              price: priceEl?.textContent?.trim() || "",
              location: locEl?.textContent?.trim() || "",
              link: el.href || "",
            });
          }
        });
      } else {
        cards.forEach((card) => {
          const titleEl = card.querySelector("h2, [data-ds-component='Text']");
          const priceEl = card.querySelector("h3, [data-ds-component='Text'][class*='price']");
          const locEl = card.querySelector("p, [data-ds-component='Text'][class*='location']");
          const linkEl = card.querySelector("a[href*='/d/']");

          if (titleEl) {
            items.push({
              title: titleEl.textContent?.trim() || "",
              price: priceEl?.textContent?.trim() || "",
              location: locEl?.textContent?.trim() || "",
              link: linkEl?.href || "",
            });
          }
        });
      }
      return items;
    });

    console.log(`[OLX] Encontrados ${listings.length} anúncios`);

    for (const item of listings) {
      // Tentar extrair telefone do título ou descrição
      const phoneMatch = (item.title + " " + item.price).match(/(\d{11})/);
      const phone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;

      leads.push({
        name: item.title.slice(0, 100),
        phone_number: phone,
        source: "olx",
        metadata: {
          price: item.price,
          location: item.location,
          link: item.link,
          scraped_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.error("[OLX] Erro:", err.message);
  }

  return leads;
}

// ─── Enviar Leads para o CRM ────────────────────────────────────────────────

async function sendLeads(leads, source) {
  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    try {
      // Verificar se já existe (por telefone se disponível)
      if (lead.phone_number) {
        const existing = await supabaseQuery(
          "contacts",
          `organization_id=eq.${ORG_ID}&phone_number=eq.${encodeURIComponent(lead.phone_number)}&select=id`
        );
        if (existing.length > 0) {
          skipped++;
          continue;
        }
      }

      // Criar contato
      const contact = await supabaseInsert("contacts", {
        organization_id: ORG_ID,
        name: lead.name,
        phone_number: lead.phone_number,
        source: lead.source,
      });

      if (contact && contact.length > 0) {
        created++;
        console.log(`[CRM] Contato criado: ${lead.name} (${lead.source})`);

        // Criar lead no pipeline automaticamente via automation rule
        // (a rule "Auto-criar lead no WhatsApp" deve disparar)
      }
    } catch (err) {
      console.error(`[CRM] Erro ao criar contato: ${err.message}`);
    }
  }

  console.log(`[${source}] ${created} criados, ${skipped} duplicados`);
  return { created, skipped };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const source = process.argv[2] || "all";
  console.log(`\n🚀 Scraper de Leads - ${new Date().toISOString()}`);
  console.log(`   Fonte: ${source}`);
  console.log(`   Org: ${ORG_ID}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "pt-BR",
  });

  const page = await context.newPage();

  try {
    let allLeads = [];

    if (source === "all" || source === "facebook") {
      const fbLeads = await scrapeFacebook(page);
      if (fbLeads.length > 0) {
        await sendLeads(fbLeads, "Facebook Marketplace");
        allLeads = allLeads.concat(fbLeads);
      }
    }

    if (source === "all" || source === "olx") {
      const olxLeads = await scrapeOLX(page);
      if (olxLeads.length > 0) {
        await sendLeads(olxLeads, "OLX");
        allLeads = allLeads.concat(olxLeads);
      }
    }

    console.log(`\n✅ Total: ${allLeads.length} leads capturados`);
  } catch (err) {
    console.error("Erro fatal:", err);
  } finally {
    await browser.close();
  }
}

main();
