variable "cloudflare_api_token" {
  description = "Cloudflare API token (keep out of git — use terraform.tfvars)"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
  default     = "8db4bf1e04f1e8b7c73fc5c11e0d1216"
}

variable "cloudflare_zone_id" {
  description = "Zone ID for andreasbogossian.com"
  type        = string
  default     = "f2bbb1abaa1f3785085825c76fcf59a6"
}

variable "pages_project_name" {
  description = "Name of the Cloudflare Pages project (check dash.cloudflare.com → Workers & Pages)"
  type        = string
  default     = "tech-blog"
}
