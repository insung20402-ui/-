# Renders service-guide.md to a self-contained service-guide.html.
# Run: uv run --with markdown docs/build.py
import pathlib
import markdown

here = pathlib.Path(__file__).parent
body = markdown.markdown((here / "service-guide.md").read_text(encoding="utf-8"),
                         extensions=["tables", "fenced_code", "toc"])
body = body.replace("<li>[ ] ", '<li class="todo"><input type="checkbox"> ')
body = body.replace("<table>", '<div class="scroll"><table>').replace("</table>", "</table></div>")
for tag, cls in (("[검증]", "ok"), ("[보고서]", "src"), ("[미검증]", "warn")):
    body = body.replace(tag, f'<span class="tag {cls}">{tag[1:-1]}</span>')

page = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>로드뷰 서비스 적용 가이드</title>
<style>
  :root {{
    --bg: #f6f7f9; --surface: #ffffff; --text: #171a1f; --muted: #5c6672; --line: #dde2e8;
    --accent: #2563eb; --code: #eef1f5;
    --ok-bg: #dcf5e6; --ok: #116239; --src-bg: #e4ecfb; --src: #1d4fb8; --warn-bg: #fdecc8; --warn: #8a5300;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #0f1216; --surface: #171b21; --text: #e7eaee; --muted: #9aa4b1; --line: #2a313a;
      --accent: #7aa7ff; --code: #212730;
      --ok-bg: #143523; --ok: #7fdcaa; --src-bg: #18294d; --src: #9dbdff; --warn-bg: #3d2c0a; --warn: #f3c56b;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.7 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }}
  main {{ max-width: 860px; margin: 0 auto; padding: 48px 20px 96px; }}
  h1 {{ font-size: 30px; line-height: 1.25; letter-spacing: -0.02em; margin: 0 0 16px; }}
  h2 {{ font-size: 21px; margin: 56px 0 12px; padding-top: 20px; border-top: 1px solid var(--line); }}
  h3 {{ font-size: 17px; margin: 28px 0 8px; }}
  p, li {{ max-width: 68ch; }}
  li {{ margin: 6px 0; }}
  a {{ color: var(--accent); }}
  code {{ font: 13.5px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code); padding: 1px 5px; border-radius: 4px; }}
  pre {{ background: var(--code); padding: 14px 16px; border-radius: 8px; overflow-x: auto; }}
  pre code {{ background: none; padding: 0; }}
  .scroll {{ overflow-x: auto; margin: 14px 0; }}
  table {{ border-collapse: collapse; width: 100%; background: var(--surface); border: 1px solid var(--line); font-size: 14.5px; }}
  th, td {{ text-align: left; vertical-align: top; padding: 9px 12px; border-bottom: 1px solid var(--line); }}
  th {{ font-size: 13px; color: var(--muted); font-weight: 600; background: var(--bg); white-space: nowrap; }}
  tr:last-child td {{ border-bottom: 0; }}
  .tag {{ display: inline-block; font-size: 11.5px; font-weight: 700; line-height: 1; padding: 3px 6px; border-radius: 4px; white-space: nowrap; vertical-align: 1px; }}
  .tag.ok {{ background: var(--ok-bg); color: var(--ok); }}
  .tag.src {{ background: var(--src-bg); color: var(--src); }}
  .tag.warn {{ background: var(--warn-bg); color: var(--warn); }}
  li.todo {{ list-style: none; margin-left: -22px; }}
  li.todo input {{ margin-right: 8px; }}
  nav.kit {{ font-size: 14px; color: var(--muted); margin-bottom: 28px; }}
  nav.kit a {{ margin-right: 14px; white-space: nowrap; }}
  @media print {{ body {{ background: #fff; }} h2 {{ break-after: avoid; }} }}
</style>
</head>
<body>
<main>
<nav class="kit"><a href="../index.html">키트 첫 화면</a><a href="../backoffice/index.html">백오피스</a><a href="../a-split/index.html">시안 A</a><a href="../b-immersive/index.html">시안 B</a><a href="../c-inspector/index.html">시안 C</a></nav>
{body}
</main>
</body>
</html>
"""
(here / "service-guide.html").write_text(page, encoding="utf-8")
print("written", len(page))
