import os, certifi
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
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
pk = os.getenv("tiger_private_key_pk1", "").replace("-----BEGIN RSA PRIVATE KEY-----", "").replace("-----END RSA PRIVATE KEY-----", "").strip()
config.private_key = pk
config.language = Language.en_US
c = QuoteClient(config)

ct = c.get_current_future_contract("CL")
cid = ct.iloc[0]["contract_code"]
r = c.get_future_brief([cid])
print("Columns:", list(r.columns))
row = r.iloc[0]
for col in r.columns:
    print(f"  {col}: {row[col]}")
