# Dashboard Spot Future ALL Update (2026-03-24)

## Feature Overview

Cap nhat dashboard de theo doi theo 3 phan khuc:
- Spot
- Future
- ALL (tong Spot + Future)

Cap nhat Exchange Management de co the scroll duoc khi noi dung dai.
Loai bo header thong bao khoi app pages.

## Architecture Impact

Presentation:
- Them component dashboard tong hop co tab Spot/Future/ALL.
- PNL chart, calendar, recent trades refetch theo segment dang chon.

Application:
- Them API moi: GET /api/pnl/overview
- Mo rong API /api/pnl/summary, /api/pnl/chart, /api/pnl/calendar, /api/pnl/trades de nhan query `segment`.

Domain:
- Mo rong pnl service de loc theo trade type.
- Them tong hop metrics dashboard: PNL (today, 7, 30, 90), win rate (7, 30, 90), total trades + volume.

Infrastructure:
- DB query trades ho tro loc `trade_type`.
- Them ham tong hop count + volume tu bang trades.

## API Endpoints

- GET /api/pnl/overview?segment=all|spot|futures
  - Tra ve:
    - pnl.today, pnl.d7, pnl.d30, pnl.d90
    - winRate.d7, winRate.d30, winRate.d90
    - totalTrades.count, totalTrades.volumeUsd

- GET /api/pnl/summary?range=...&segment=all|spot|futures
- GET /api/pnl/chart?range=...&segment=all|spot|futures
- GET /api/pnl/calendar?view=...&year=...&month=...&segment=all|spot|futures
- GET /api/pnl/trades?limit=...&segment=all|spot|futures

## Validation Summary

Da kiem tra:
- ESLint: khong co error moi do thay doi nay.
- next build: fail do loi da ton tai truoc trong app/api/exchange/debug/verify/route.ts (thieu package undici), khong phai do thay doi dashboard/exchange trong feature nay.

## Notes

Win rate duoc tinh theo so ngay co PNL > 0 tren tong so ngay trong khoang (7/30/90), phu hop quy tac thong ke theo PNL calendar.
