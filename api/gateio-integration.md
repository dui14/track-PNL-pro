# Gate.io API Integration va PNL Tracking

## 1. Muc tieu

Tai lieu nay mo ta cach dong bo du lieu tu Gate.io vao he thong de:
- Hien thi Recent Executed Trades
- Tinh PNL cho chart va calendar
- Lay balance va open positions

## 2. Base URL va Authentication

Base URL:
- `https://api.gateio.ws/api/v4`

Headers bat buoc:
- `KEY`: API key
- `Timestamp`: Unix timestamp theo giay
- `SIGN`: chu ky HMAC-SHA512

Chuoi ky:
- `METHOD + "\n" + "/api/v4" + requestPath + "\n" + queryString + "\n" + sha512(body) + "\n" + timestamp`

Quy tac:
- `requestPath` trong chuoi ky la path khong gom domain, vi du `/spot/accounts`
- `queryString` phai giong 100% query gui len request
- Neu GET khong co body thi `body` la chuoi rong `""`

## 3. Endpoint can dung

### 3.1 Verify API key
- `GET /spot/accounts?currency=USDT`
- Ky v4, neu response la array thi key hop le

### 3.2 Spot trades
- `GET /spot/my_trades?from=<sec>&to=<sec>&limit=1000&page=<n>`
- Dong bo theo window toi da 30 ngay

### 3.3 Futures fills
- `GET /futures/{settle}/my_trades_timerange?from=<sec>&to=<sec>&limit=100&offset=<n>`
- `settle`: `usdt`, `btc`

### 3.4 Futures realized pnl
- `GET /futures/{settle}/position_close?from=<sec>&to=<sec>&limit=100&offset=<n>`
- Day la nguon uu tien de lay `realized_pnl` cho dashboard

### 3.5 Balances
- `GET /spot/accounts`

### 3.6 Open positions
- `GET /futures/{settle}/positions`

## 4. Normalization mapping

### 4.1 Spot fills
- `external_trade_id`: `id` hoac fallback theo `order_id + create_time`
- `trade_type`: `spot`
- `realized_pnl`: `null`
- `income_type`: `null`

### 4.2 Futures fills
- `external_trade_id`: `id` hoac fallback theo `order_id + create_time`
- `trade_type`: `futures`
- `realized_pnl`: lay tu `pnl` neu co, neu khong thi `null`
- `income_type`: `fill_history`

### 4.3 Position close events
- `external_trade_id`: `id` hoac fallback theo `order_id + time`
- `trade_type`: `futures`
- `quantity`: `0`
- `price`: `0`
- `realized_pnl`: lay tu `pnl`/`close_pnl`/`realized_pnl`
- `income_type`: `position_close`

## 5. Merge logic de tranh mat PNL

Pipeline khuyen nghi:
1. Fetch spot trades
2. Fetch futures fills
3. Fetch futures position_close events
4. Gop tat ca records
5. Deduplicate theo khoa: `symbol + external_trade_id`

Ly do:
- Recent trades can du lieu fill
- PNL calendar can du lieu close pnl
- Gate co the tra ve futures fills ma khong co `pnl`, nen bat buoc bo sung tu `position_close`

## 6. Chien luoc pagination va an toan

- Spot: `limit=1000`, `page` tang dan den khi trang < 1000
- Futures: `limit=100`, `offset += 100` den khi page < 100
- Mỗi request co retry exponential khi gap `429`
- Delay nho giua cac request de tranh burst

## 7. Kiem thu sau khi implement

Can smoke test toi thieu:
- Verify key: `GET /spot/accounts?currency=USDT`
- Trades filter:
  - `/api/pnl/trades?segment=all&exchange=gateio`
  - `/api/pnl/trades?segment=futures&exchange=gateio`
- Overview:
  - `/api/pnl/overview?segment=all&exchange=gateio`
- Calendar/chart:
  - `/api/pnl/chart?range=week&segment=futures&exchange=gateio`

## 8. Loi thuong gap

- `INVALID_KEY`: API key bi sai hoac bi revoke
- `INVALID_SIGNATURE`: sai prehash, sai query string, hoac sai secret
- `403`: key bi chan IP whitelist
- Data fills co nhung PNL rong: can fetch them `position_close`