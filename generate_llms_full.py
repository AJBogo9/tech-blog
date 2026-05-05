"""Generates llms.txt and llms-full.txt from post frontmatter and content."""
import re
from pathlib import Path

POSTS_DIR = Path("posts")
SITE_URL = "https://andreasbogossian.com"

def strip_frontmatter(text):
    if text.startswith("---"):
        end = text.index("---", 3)
        return text[end + 3:].lstrip()
    return text

def strip_code_blocks(text):
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"\{ojs\}.*?\n(?=\n|\Z)", "", text, flags=re.DOTALL)
    return text

def extract_frontmatter_field(raw, field):
    match = re.search(rf'^{field}:\s*["\']?(.+?)["\']?\s*$', raw, re.MULTILINE)
    return match.group(1) if match else ""

def load_posts():
    posts = []
    for post in sorted(POSTS_DIR.glob("*/index.qmd"), key=lambda p: p.parent.name):
        raw = post.read_text()
        title = extract_frontmatter_field(raw, "title")
        date = extract_frontmatter_field(raw, "date")
        description = extract_frontmatter_field(raw, "description")
        slug = post.parent.name
        url = f"{SITE_URL}/posts/{slug}/index.html"
        body = strip_code_blocks(strip_frontmatter(raw)).strip()
        posts.append({"title": title, "date": date, "description": description, "url": url, "body": body})
    return sorted(posts, key=lambda p: p["date"], reverse=True)

posts = load_posts()

# llms.txt
llms_lines = [
    "# Andreas Bogossian",
    "",
    "> MSc student in Machine Learning, Data Science and AI at Aalto University. I write technical posts about ML, statistics, and algorithms — with derivations from first principles.",
    "",
    "## Blog Posts",
    "",
]
for p in posts:
    llms_lines.append(f"- [{p['title']}]({p['url']}): {p['description']}")

llms_lines += [
    "",
    "## Pages",
    "",
    f"- [Blog]({SITE_URL}/blog.html)",
    f"- [Publications]({SITE_URL}/publications.html)",
    f"- [Projects]({SITE_URL}/projects.html)",
    f"- [CV]({SITE_URL}/cv.html)",
]

Path("llms.txt").write_text("\n".join(llms_lines) + "\n")
print(f"Written llms.txt ({len(posts)} posts)")

# llms-full.txt
sections = [f"# {p['title']}\nDate: {p['date']}\nURL: {p['url']}\n\n{p['body']}" for p in posts]
Path("llms-full.txt").write_text("\n\n---\n\n".join(sections) + "\n")
print(f"Written llms-full.txt ({Path('llms-full.txt').stat().st_size // 1024} KB)")
