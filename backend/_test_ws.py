import asyncio, websockets, json, time
async def main():
    async with websockets.connect("ws://127.0.0.1:8002/ws/quotes?symbol=CL") as ws:
        start = time.time()
        for _ in range(5):
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            d = json.loads(msg)
            elapsed = time.time() - start
            print(f"[{elapsed:.1f}s] {d['symbol']} ${d['price']} chg={d['chgPct']:.4f}% preClose=${d['preClose']} vol={d['volume']}")
asyncio.run(main())
