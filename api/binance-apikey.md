Dưới đây là danh sách đầy đủ các endpoint và logic xử lý dữ liệu từ Binance API (sử dụng xác thực HMAC SHA256) để hệ thống **aiTrackProfit** có thể tracking chính xác các thông số PNL, Win Rate và hiệu suất cho Spot, Futures và tổng hợp (ALL).

### 1. Tracking Giao dịch Spot (Giao ngay)

Do Binance API không cung cấp một endpoint duy nhất trả về "PNL lịch sử" cho Spot, hệ thống cần thu thập dữ liệu thô và tự tính toán.

**Các Endpoint cần thiết:**
*   **Thông tin tài khoản:** `GET /api/v3/account`
    *   *Mục đích:* Lấy danh sách các tài sản có số dư khác 0 để xác định các cặp giao dịch (`symbol`) cần truy vấn.
*   **Lịch sử khớp lệnh:** `GET /api/v3/myTrades`
    *   *Mục đích:* Lấy chi tiết từng lệnh đã khớp (giá, số lượng, phí, thời gian). Endpoint này bắt buộc phải gửi kèm tham số `symbol`, vì vậy hệ thống phải lặp qua các cặp tiền từ bước trên.
*   **Lịch sử nạp/rút:** `GET /sapi/v1/capital/deposit/hisrec` và `GET /sapi/v1/capital/withdraw/history`
    *   *Mục đích:* Xác định dòng vốn vào/ra (Net Transfers) để tính PNL chính xác theo công thức của sàn.

**Logic tính toán cho Dashboard:**
*   **PNL Hôm nay:** `= Số dư cuối ngày - Số dư đầu ngày - Tổng nạp ròng trong ngày`.
*   **PNL 7/30/90 ngày:** Cộng dồn PNL hàng ngày trong khoảng thời gian tương ứng.
*   **Win Rate (7/30/90 ngày):** `= (Số ngày có PNL dương / Tổng số ngày có phát sinh giao dịch) * 100` [Conversation History].
*   **PNL Calendar:** Nhóm dữ liệu PNL theo từng ngày (từ `myTrades` và biến động số dư) để hiển thị biểu đồ lịch lời/lỗ.
*   **Total Trades:** Đếm tổng số bản ghi trả về từ `myTrades`.
*   **Trading Volume ($):** Tổng của `price * qty` từ tất cả các lệnh đã khớp trong `myTrades`.

---

### 2. Tracking Giao dịch Futures (Hợp đồng tương lai)

Việc tracking Futures thuận tiện hơn nhờ endpoint "Income History" trả về các dòng tiền lãi lỗ trực tiếp.

**Các Endpoint cần thiết:**
*   **Lịch sử thu nhập:** `GET /fapi/v1/income` (đối với USDⓈ-M) hoặc `GET /dapi/v1/income` (đối với Coin-M).
    *   *Tham số quan trọng:* Lọc theo `incomeType` bao gồm:
        *   `REALIZED_PNL`: Lãi lỗ đã thực hiện từ việc đóng vị thế.
        *   `FUNDING_FEE`: Phí tài trợ.
        *   `COMMISSION`: Phí giao dịch.
*   **Thông tin vị thế hiện tại:** `GET /fapi/v2/account`
    *   *Mục đích:* Lấy `unrealizedProfit` (lãi lỗ chưa thực hiện) để tính PNL real-time cho Dashboard.

**Logic tính toán cho Dashboard:**
*   **PNL (Hôm nay/7/30/90 ngày/Trọn đời):** `= Tổng(REALIZED_PNL) + Tổng(FUNDING_FEE) + Tổng(COMMISSION)`. 
    *   *Lưu ý:* Endpoint này chỉ lưu dữ liệu **3 tháng gần nhất**. Để có dữ liệu "Trọn đời", hệ thống aiTrackProfit cần có cơ chế lưu trữ (caching) dữ liệu cũ.
*   **Win Rate:** Tính dựa trên tỷ lệ các ngày có tổng thu nhập dương trong lịch sử [Conversation History].
*   **PNL Performance:** Dựa trên ROI được tính từ: `(Lãi lỗ ròng) / (Ký quỹ ban đầu)`.
*   **Total Trades & Volume:** Lấy từ danh sách các lệnh đã khớp qua endpoint `GET /fapi/v1/userTrades`.

---

### 3. Tracking ALL (Spot + Futures)

Đây là mục tổng hợp để người dùng có cái nhìn toàn diện về tài sản trên sàn Binance.

**Logic tổng hợp dữ liệu:**
*   **Tổng PNL:** `= PNL Spot + PNL Futures`.
*   **PNL Calendar (ALL):** Hợp nhất các điểm dữ liệu lãi lỗ theo ngày của cả hai phân đoạn Spot và Futures lên cùng một biểu đồ.
*   **Win Rate (ALL):** Tính dựa trên tổng số ngày có lời của tài khoản (tổng Spot + Futures trong ngày đó > 0).
*   **Phân bổ tài sản (Asset Allocation):** Sử dụng `GET /api/v3/account` (Spot) và `GET /fapi/v2/account` (Futures) để lấy số dư và quy đổi tất cả sang giá trị USD tại thời điểm hiện tại để hiển thị biểu đồ tròn phân bổ.

### Các lưu ý kỹ thuật quan trọng cho Agent:
1.  **Xác thực HMAC:** Mọi yêu cầu truy cập dữ liệu cá nhân phải bao gồm `apiKey` trong Header (`X-MBX-APIKEY`) và chữ ký `signature` (tạo từ chuỗi truy vấn + `secretKey` bằng thuật toán HMAC SHA256).
2.  **Giới hạn thời gian:** Nếu không gửi `startTime` và `endTime`, Binance thường mặc định trả về dữ liệu 7 ngày gần nhất.
3.  **Bảo mật:** Hệ thống chỉ yêu cầu quyền **Read-Only**. Agent cần cảnh báo người dùng nếu API Key có bật quyền "Enable Withdrawals" [Conversation History].
4.  **Lỗi 500/Timeout:** Để tránh lỗi này, Agent nên thực hiện gọi API tuần tự: Kiểm tra quyền hạn Key -> Lấy danh sách Asset -> Truy vấn lịch sử các Asset đó thay vì quét toàn bộ sàn [Conversation History].