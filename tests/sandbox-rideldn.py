# tests/sandbox-rideldn.py — scripted RideLDN test against tests/sandbox-rideldn.html (Workstream D)
#   python3 tests/sandbox-rideldn.py [base_url] [out_dir]
# 1. offline (mock backend): name modal -> go online -> accept a job -> teleport to the pickup -> passenger boards ->
#    autopilot drives the GPS route to the drop-off -> a ride with a fare is recorded in the mock DB (localStorage)
# 2. online path with a stubbed Supabase (page.route): join / finish_ride requests carry the right args, a server
#    rejection is shown, and a network failure falls back to the offline mock (Offline pill).
import sys, asyncio, json
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/london-loop/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
URL = BASE + 'tests/sandbox-rideldn.html'
ARGS = ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        raise SystemExit(1)

async def shot(pg, path):
    try:
        await pg.screenshot(path=path, timeout=150000)
        print('  shot', path)
    except Exception as e:  # a slow software-rendered frame shouldn't fail the logic test
        print('  (screenshot skipped:', path, str(e).splitlines()[0], ')')

async def wait_for(pg, js, timeout=60):
    for _ in range(int(timeout * 4)):
        if await pg.evaluate(js):
            return True
        await pg.wait_for_timeout(250)
    return False

async def offline_test(b):
    pg = await b.new_page(viewport={"width": 1280, "height": 760})
    logs = []
    pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"[:300]))
    pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"[:500]))
    await pg.route("**/*", lambda r: r.abort() if not r.request.url.startswith("http://localhost") else r.continue_())
    await pg.goto(URL + '?webgl&offline', wait_until="domcontentloaded", timeout=120000)
    await pg.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    await pg.reload(wait_until="domcontentloaded", timeout=120000)
    check(await wait_for(pg, "() => !!document.querySelector('.rl-modal input')", 40), 'driver-name modal shown on first play')
    name = await pg.eval_on_selector('.rl-modal input', 'e => e.value')
    check(name.split('_')[0].isalpha() and name.split('_')[-1].isdigit(), f'prefilled London-y name ({name})')
    await pg.wait_for_timeout(400)
    await shot(pg, f'{OUT}/rideldn-modal.png')
    await pg.keyboard.press('Enter')
    check(await wait_for(pg, "() => window.sandbox && window.sandbox.ready", 20), 'joined (mock)')
    check(await pg.evaluate("() => !!document.querySelector('.rl-offline-pill')"), 'Offline pill visible')
    stored = await pg.evaluate("() => JSON.parse(localStorage.getItem('londonloop_player'))")
    check(stored and stored['id'] and stored['token'] and stored['name'] == name, 'player stored in localStorage londonloop_player')

    # mode gating: in the black cab the app offers the switch button
    await pg.evaluate("() => sandbox.controllers.setMode('car')")
    ok = await wait_for(pg, "() => document.querySelector('.rl-phone').innerText.includes('Switch to RideLDN car')", 20)
    check(ok, 'other mode -> "Switch to RideLDN car" offered')
    await shot(pg, f'{OUT}/rideldn-wrongmode.png')
    await pg.click('text=Switch to RideLDN car')
    await pg.wait_for_timeout(300)
    check(await pg.evaluate("() => sandbox.controllers.activeMode") == 'ride', 'switch button calls ui.setMode("ride")')

    await pg.click('.rl-go')
    await pg.wait_for_timeout(300)
    check(await pg.evaluate("() => sandbox.rideldn.online"), 'went online')
    await shot(pg, f'{OUT}/rideldn-online.png')
    ok = await pg.evaluate("() => sandbox.rideldn.requestJob()")
    check(ok and await pg.evaluate("() => sandbox.rideldn.phase") == 'offer', 'job offered')
    job = await pg.evaluate("() => { const j = sandbox.rideldn.job; return { pax: j.pax.name, pu: j.pickup.name, df: j.dropoff.name, fare: j.estFare, dist: j.estDistance } }")
    print('  offer:', job)
    await pg.wait_for_timeout(500)
    await shot(pg, f'{OUT}/rideldn-offer.png')
    check(await pg.evaluate("() => sandbox.rideldn.phase") == 'offer', 'offer still pending')
    await pg.keyboard.press('Enter')
    await pg.wait_for_timeout(300)
    check(await pg.evaluate("() => sandbox.rideldn.phase") == 'pickup', 'accepted with Enter -> heading to pickup')
    route = await pg.evaluate("() => sandbox.rideldn.getRoute()")
    check(len(route) >= 2, f'getRoute() returns a GPS route ({len(route)} pts)')
    # wide shot of the pickup pin + route from behind the car
    await pg.wait_for_timeout(1500)
    await shot(pg, f'{OUT}/rideldn-pickup-route.png')

    # teleport to the pickup kerb, wait for boarding
    # close-up of the waiting passenger + pin from the road (camera override), then a far view of the beam
    await pg.evaluate("""() => { const p = sandbox.rideldn.job.pickup; const h = p.heading;
        sandbox.teleport(p.x - Math.sin(h) * 30, p.z - Math.cos(h) * 30, h);
        const lx = Math.cos(h), lz = -Math.sin(h);
        sandbox.camOverride = { pos: [p.x - Math.sin(h) * 14 - lx * 3, 3.2, p.z - Math.cos(h) * 14 - lz * 3], look: [p.px, 1.6, p.pz] }; }""")
    await pg.wait_for_timeout(1500)
    await shot(pg, f'{OUT}/rideldn-passenger.png')
    await pg.evaluate("""() => { const p = sandbox.rideldn.job.pickup;
        sandbox.camOverride = { pos: [p.x + 380, 120, p.z + 420], look: [p.x, 20, p.z] }; }""")
    await pg.wait_for_timeout(1500)
    await shot(pg, f'{OUT}/rideldn-beam-far.png')
    await pg.evaluate("() => { sandbox.camOverride = null; }")
    await pg.evaluate("() => { const p = sandbox.rideldn.job.pickup; sandbox.teleport(p.x, p.z, p.heading); }")
    check(await wait_for(pg, "() => sandbox.rideldn.phase === 'ride'", 30), 'passenger boarded after stopping at the pin')
    await pg.wait_for_timeout(800)
    await shot(pg, f'{OUT}/rideldn-dropoff-route.png')
    # drive the route (autopilot, sim time ×4) until the ride is recorded
    await pg.evaluate("() => { sandbox.autopilot.speed = 13; sandbox.autopilot.on = true; sandbox.timeScale = 4; }")
    done = await wait_for(pg, "() => !!sandbox.rideldn.lastResult", 300)
    await pg.evaluate("() => { sandbox.timeScale = 1; }")
    check(done, 'drove to the drop-off and finished the ride')
    await pg.wait_for_timeout(700)
    await shot(pg, f'{OUT}/rideldn-result.png')
    res = await pg.evaluate("() => sandbox.rideldn.lastResult")
    print('  result:', {k: res[k] for k in ('pickup', 'dropoff', 'distance_m', 'duration_s', 'rating', 'fare', 'error')})
    db = await pg.evaluate("() => JSON.parse(localStorage.getItem('londonloop_mock_db'))")
    rides = [r for r in db['rides'] if r['player_id'] == stored['id']]
    check(len(rides) == 1 and rides[0]['fare'] > 3, f"ride recorded in the mock backend with a fare (£{rides[0]['fare'] if rides else '?'})")
    me = db['players'][stored['id']]
    check(me['ride_count'] == 1 and abs(me['ride_earnings'] - rides[0]['fare']) < 0.01, 'player totals updated')
    # leaderboard + recent rides tabs
    await pg.evaluate("() => sandbox.rideldn._closeResult(true)")
    await pg.click('.rl-tab:has-text("Leaderboard")')
    await pg.wait_for_timeout(500)
    check(name in await pg.inner_text('.rl-body'), 'leaderboard lists the player')
    await shot(pg, f'{OUT}/rideldn-leaderboard.png')
    await pg.click('.rl-tab:has-text("My rides")')
    await pg.wait_for_timeout(500)
    check(rides[0]['pickup'] in await pg.inner_text('.rl-body'), 'recent rides lists the ride')
    await shot(pg, f'{OUT}/rideldn-rides.png')
    # R collapses the panel
    await pg.keyboard.press('KeyR')
    await pg.wait_for_timeout(500)
    check(await pg.evaluate("() => document.querySelector('.rl-root').classList.contains('rl-collapsed')"), 'R collapses the app')
    await shot(pg, f'{OUT}/rideldn-collapsed.png')
    # autosave writes state
    await pg.evaluate("() => sandbox.backend.saveNow()")
    await pg.wait_for_timeout(400)
    db = await pg.evaluate("() => JSON.parse(localStorage.getItem('londonloop_mock_db'))")
    st = db['players'][stored['id']]['state']
    check(st and st['mode'] == 'ride' and 'pos' in st and db['players'][stored['id']]['distance_m'] > 100, 'save stores state + distance travelled')
    errs = [l for l in logs if 'pageerror' in l or '[error]' in l]
    check(not errs, 'no page errors' + ('' if not errs else ': ' + '\n'.join(errs)))
    await pg.close()

async def online_test(b):
    pg = await b.new_page(viewport={"width": 1100, "height": 700})
    calls = []
    mode = {'fail': False}
    async def handle(route):
        req = route.request
        url = req.url
        if 'supabase.co/rest/v1/rpc/' in url:
            fn = url.rsplit('/', 1)[-1]
            body = json.loads(req.post_data or '{}')
            calls.append((fn, body, req.headers.get('apikey')))
            if mode['fail']:
                return await route.abort()
            if fn == 'slop_join':
                return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': '00000000-0000-4000-8000-000000000001', 'token': 'tok', 'name': body['p_name']}))
            if fn == 'slop_load':
                return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': body['p_id'], 'name': 'Stub_1', 'state': {'pos': {'x': 1, 'z': 2, 'h': 0}}, 'ride_count': 3, 'ride_earnings': 31.5, 'distance_m': 9000, 'rating': 4.67}))
            if fn == 'slop_finish_ride':
                return await route.fulfill(status=400, content_type='application/json', body=json.dumps({'code': 'P0001', 'message': 'Slow down - one ride at a time'}))
            if fn == 'slop_leaderboard':
                return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'name': 'Stub_1', 'rides': 3, 'earnings': 31.5, 'rating': 4.67}]))
            return await route.fulfill(status=200, content_type='application/json', body='null')
        if url.startswith('http://localhost'):
            return await route.continue_()
        return await route.abort()
    await pg.route("**/*", handle)
    await pg.goto(URL + '?webgl&autoname', wait_until="domcontentloaded", timeout=120000)
    await pg.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    await pg.reload(wait_until="domcontentloaded", timeout=120000)
    check(await wait_for(pg, "() => window.sandbox && window.sandbox.ready", 40), 'online init (stubbed Supabase)')
    check(calls and calls[0][0] == 'slop_join' and calls[0][2] == 'sb_publishable_02C3aAYazBjZDsZxRgcPAQ_tjZjNOSx', 'slop_join POSTed with apikey header')
    check(not await pg.evaluate("() => sandbox.backend.offline") and not await pg.evaluate("() => !!document.querySelector('.rl-offline-pill')"), 'online: no Offline pill')
    r = await pg.evaluate("""async () => { try { await sandbox.backend.finishRide({ pickup: 'A', dropoff: 'B', distance_m: 1234.56, duration_s: 200, rating: 4 }); return 'ok'; }
                              catch (e) { return e.message; } }""")
    fin = [c for c in calls if c[0] == 'slop_finish_ride'][-1][1]
    check(fin == {'p_id': '00000000-0000-4000-8000-000000000001', 'p_token': 'tok', 'p_pickup': 'A', 'p_dropoff': 'B', 'p_distance_m': 1234.6, 'p_duration_s': 200, 'p_rating': 4}, 'slop_finish_ride args')
    check(r == 'Slow down - one ride at a time', 'server rejection message surfaces')
    # reload -> slop_load restores
    calls.clear()
    await pg.reload(wait_until="domcontentloaded", timeout=120000)
    check(await wait_for(pg, "() => window.sandbox && window.sandbox.ready", 40), 'reload')
    check(calls[0][0] == 'slop_load', 'existing player -> slop_load on boot')
    prof = await pg.evaluate("() => sandbox.backend.profile")
    check(prof['ride_count'] == 3 and prof['rating'] == 4.67, 'profile loaded')
    # network failure -> offline fallback
    mode['fail'] = True
    ok = await pg.evaluate("() => sandbox.backend.save({ v: 1, mode: 'ride' })")
    check(ok and await pg.evaluate("() => sandbox.backend.offline") and await pg.evaluate("() => !!document.querySelector('.rl-offline-pill')"), 'network failure -> mock + Offline pill')
    await pg.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        await offline_test(b)
        await online_test(b)
        await b.close()
    print('ALL PASS')

asyncio.run(main())
