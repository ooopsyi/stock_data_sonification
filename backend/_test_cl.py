"""Quick test: can Tiger API fetch CL futures data?"""
import os, sys, certifi
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env.prod")

from tigeropen.common.consts import Language
from tigeropen.quote.quote_client import QuoteClient
from tigeropen.tiger_open_config import TigerOpenClientConfig

config = TigerOpenClientConfig(sandbox_debug=False)
config.tiger_id = os.getenv("tiger_id")
config.account = os.getenv("tiger_account")
config.license = os.getenv("tiger_license")
pk = os.getenv("tiger_private_key_pk1", "").strip()
pk = pk.replace("-----BEGIN RSA PRIVATE KEY-----", "").replace("-----END RSA PRIVATE KEY-----", "").strip()
config.private_key = pk
config.language = Language.en_US
client = QuoteClient(config)

print("=== 1. get_stock_briefs(['CL']) ===")
try:
    r = client.get_stock_briefs(["CL"], include_hour_trading=True)
    print(r)
except Exception as e:
    print(f"FAILED: {type(e).__name__}: {e}")

print("\n=== 2. get_current_future_contract('CL') ===")
try:
    r = client.get_current_future_contract("CL")
    print(r)
except Exception as e:
    print(f"FAILED: {type(e).__name__}: {e}")

print("\n=== 3. get_future_brief(['CL2507']) ===")
try:
    r = client.get_future_brief(["CL2507"])
    print(r)
except Exception as e:
    print(f"FAILED: {type(e).__name__}: {e}")

print("\n=== 4. get_future_brief with main contract ===")
try:
    main = client.get_current_future_contract("CL")
    if main is not None and not main.empty:
        cid = main.iloc[0].get("contract_code", None) or main.iloc[0].get("identifier", None)
        print(f"Main contract identifier: {cid}")
        if cid:
            r2 = client.get_future_brief([str(cid)])
            print(r2)
    else:
        print("No main contract found")
except Exception as e:
    print(f"FAILED: {type(e).__name__}: {e}")
