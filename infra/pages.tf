resource "cloudflare_pages_project" "blog" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "cf-pages"

  source {
    type = "github"
    config {
      owner                         = "AJBogo9"
      repo_name                     = "tech-blog"
      production_branch             = "cf-pages"
      pr_comments_enabled           = false
      deployments_enabled           = true
      production_deployment_enabled = true
    }
  }

  build_config {
    # publish.sh pushes pre-built _site/ contents — no build needed on CF side
    build_command   = ""
    destination_dir = "/"
  }
}

resource "cloudflare_pages_domain" "apex" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.blog.name
  domain       = "andreasbogossian.com"
}

