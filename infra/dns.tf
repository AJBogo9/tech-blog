# Apex and www point to CF Pages (proxied = orange cloud on)
resource "cloudflare_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "andreasbogossian.com"
  type    = "CNAME"
  content = "tech-blog-bjx.pages.dev"
  proxied = true
}

resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  type    = "CNAME"
  content = "tech-blog-bjx.pages.dev"
  proxied = true
}

# Add any other records here (MX for email, TXT for verification, etc.)
# Use cf-terraforming to export existing records:
#   cf-terraforming generate --resource-type cloudflare_record --zone $ZONE_ID
