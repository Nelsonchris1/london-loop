import sys, asyncio
from playwright.async_api import async_playwright
url, out, wait = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv)>3 else 20
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--enable-unsafe-webgpu","--enable-features=Vulkan","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":960,"height":540})
        logs=[]
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"[:300]))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"[:500]))
        await pg.route("**/*", lambda r: r.abort() if not r.request.url.startswith("http://localhost") else r.continue_())
        await pg.goto(url, wait_until="domcontentloaded")
        await pg.wait_for_timeout(wait*1000)
        info = await pg.evaluate("()=>({gpu: !!navigator.gpu, title: document.title, txt: document.body.innerText.slice(0,200)})")
        await pg.screenshot(path=out, timeout=120000)
        print(info); print("\n".join(logs[-30:]))
        await b.close()
asyncio.run(main())
