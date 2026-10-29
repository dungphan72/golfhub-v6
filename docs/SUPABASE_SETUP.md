# Thiết lập Supabase cho Golf Hub

Hướng dẫn này dùng để bật các luồng MVP khi mã nguồn và migration đã sẵn sàng. Không gửi mật khẩu database, `service_role`, hay secret key vào chat hoặc commit vào Git.

## 1. Tạo project

1. Tạo project Supabase tại [supabase.com/dashboard](https://supabase.com/dashboard).
2. Chọn tổ chức và vùng gần người chơi mục tiêu; Singapore thường là lựa chọn phù hợp cho giai đoạn thử nghiệm tại Việt Nam.
3. Tạo mật khẩu database mạnh và lưu trong password manager.
4. Chờ database khởi tạo xong.

## 2. Cấu hình URL xác thực

Trong **Authentication → URL Configuration**:

- Site URL: `http://127.0.0.1:3000` khi chạy local trong workspace này.
- Thêm redirect URL chính xác `http://127.0.0.1:3000/auth/callback`.
- Mở email xác nhận trong cùng trình duyệt/profile đã gửi form đăng ký để cookie PKCE còn khả dụng.
- Dùng chính hostname đã đăng ký (`127.0.0.1`, không đổi sang `localhost`) khi mở callback. Nếu Supabase giới hạn gửi email, chờ hết giới hạn hoặc cấu hình SMTP riêng; không thử gửi liên tiếp.
- Callback PKCE mang tham số `sb_flow_id` để ghép email link với đúng verifier đã lưu trong cookie. Giữ `Site URL` cùng origin với `APP_URL`; nếu đổi domain, cập nhật URL xác thực và redirect allow-list tương ứng.
- Khi triển khai, thêm URL production chính xác, ví dụ `https://ten-mien-cua-ban/auth/callback`; không dùng wildcard rộng.
- Bật email/password trong **Authentication → Sign In / Providers**. Giữ yêu cầu xác nhận email bật ở production.

## 3. Cấu hình biến môi trường

1. Sao chép `.env.example` thành `.env.local` trong thư mục gốc.
2. Lấy **Project URL** và **Publishable key** trong **Project Settings → API Keys**.
3. Điền:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
APP_URL=http://127.0.0.1:3000
```

`SUPABASE_PUBLISHABLE_KEY` được thiết kế để dùng ở phía client, nhưng ứng dụng này chỉ dùng nó trong mã server. Không đặt `service_role` hoặc secret key vào biến `NEXT_PUBLIC_*`.

## 4. Áp dụng migration

Các migration MVP, báo cáo Phase 2 và PayOS payment nằm trong `supabase/migrations/`. Có thể áp dụng từ thư mục gốc bằng Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Đọc SQL và xác nhận đúng project trước khi chạy. Các migration bật RLS và thu hồi quyền mặc định cho các bảng MVP; không thay bằng chính sách cho phép mọi người đọc/ghi.

Cần hai golfer riêng biệt đã xác nhận email để chạy kiểm thử tích hợp trên project đã link. Script kiểm tra RLS, booking, partner onboarding và admin RPC; role admin chỉ được thêm trong transaction test và toàn bộ dữ liệu/role được rollback khi kết thúc:

```powershell
npx supabase db query --linked --file supabase/tests/mvp_critical_flows.sql
npx supabase db query --linked --file supabase/tests/partner_booking_reports.sql
npx supabase db query --linked --file supabase/tests/payos_payments.sql
powershell -ExecutionPolicy Bypass -File supabase/tests/mvp_concurrency_test.ps1
```

The concurrency test opens two separate database sessions, checks that a capacity-one tee time accepts exactly one booking, and removes its temporary fixtures.

Để kiểm thử luồng giao diện end-to-end, tạo sân test tạm có nhãn `TEST ONLY`, đăng nhập trong trình duyệt, rồi dùng URL được script in ra. Sau khi kiểm thử, luôn dọn dữ liệu bằng lệnh cleanup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/mvp_e2e_fixture.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/mvp_e2e_fixture.ps1 -Action Cleanup
```

Fixture chỉ tồn tại tạm trên project thử nghiệm; cleanup xóa sân, khung giờ, booking và thông báo liên quan.

## 5. Tạo tài khoản quản trị đầu tiên

Chưa có tài khoản nào được mặc định là quản trị viên. Sau khi xác thực email và đăng nhập một tài khoản người quản trị, chạy truy vấn có chủ đích trong SQL Editor để cấp quyền cho đúng UUID:

```sql
insert into public.user_roles (user_id, role)
values ('<auth-user-uuid>', 'SUPER_ADMIN');
```

Lấy UUID từ **Authentication → Users** và kiểm tra lại trước khi chạy. Không cấp role qua metadata do người dùng tự gửi.

## 6. Chạy ứng dụng

```powershell
npm install
npm run dev
```

Sau khi cập nhật `.env.local`, khởi động lại dev server. Trong workspace này hãy mở `http://127.0.0.1:3000`; `localhost` có thể trỏ tới một dịch vụ khác. Chưa có dữ liệu sân được xác minh; trang danh sách sẽ tiếp tục báo trống cho tới khi quản trị viên/đối tác nhập và xác minh dữ liệu thật.

## 7. Sẵn sàng production

- Cấu hình hệ thống giám sát bên ngoài gọi `GET https://<domain>/api/health` mỗi phút và gửi cảnh báo khi nhận HTTP `503` hoặc không kết nối được. Endpoint kiểm tra Supabase bằng truy vấn chỉ đọc, có timeout 3 giây; response không tiết lộ URL, mã lỗi hay dữ liệu sân.
- Endpoint health chỉ xác nhận ứng dụng truy vấn được Supabase; không kiểm tra PayOS, gửi email, hay khả năng người dùng đăng nhập. Theo dõi các tích hợp đó riêng sau khi cấu hình.
- Bật rate limit tại CDN/WAF cho route công khai và server actions; endpoint health cần được cho phép từ dịch vụ giám sát nhưng không nên mở không giới hạn.
- Chọn retention backup và Point-in-Time Recovery theo gói Supabase production trước khi nhận giao dịch thật. Ghi rõ người có quyền khôi phục, quy trình phục hồi, RPO/RTO, và định kỳ kiểm thử restore trên project riêng.
- Thiết lập kênh cảnh báo, người trực, và quy trình ứng phó sự cố trước khi mở production.

## Tình trạng

Project thử nghiệm đã được cấu hình và cả chín migration đã áp dụng thành công; Auth API có phản hồi và email sign-in đang bật. Đăng ký, xác nhận email, đăng nhập, tạo hồ sơ, quyền đọc hồ sơ golfer, tenant isolation, booking đồng thời, luồng đặt/hủy, ngăn quản trị viên tự xét duyệt hồ sơ đối tác và các quy tắc đối soát PayOS trong cơ sở dữ liệu đã được kiểm thử. Link email xác nhận vẫn cần một round-trip PKCE mới trong cùng browser context. Tích hợp PayOS có trong mã nhưng chưa chạy giao dịch cho tới khi cấu hình credentials sandbox và webhook HTTPS công khai. Chưa có dữ liệu sân/khung giờ thật được xác minh; booking giữ chỗ hết hạn sau 10 phút.

## Cấu hình PayOS sandbox

Lấy Client ID, API Key và Checksum Key trong kênh thanh toán PayOS sandbox; đặt chúng cùng `SUPABASE_SERVICE_ROLE_KEY` trong `.env.local` hoặc secret manager của môi trường server:

```env
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Không gửi các khóa này trong chat, không đưa vào biến `NEXT_PUBLIC_*`, và không commit `.env.local`. Trong PayOS, cấu hình webhook đến `https://<domain-cong-khai>/api/webhooks/payos`; localhost/127.0.0.1 không nhận được webhook từ PayOS. Đặt `APP_URL` thành HTTPS origin được PayOS chấp nhận cho đường dẫn return/cancel. Sau đó đăng nhập bằng golfer, tạo booking fixture có nhãn TEST ONLY, hoàn tất thanh toán sandbox, và xác nhận booking chỉ chuyển sang `confirmed` sau webhook hợp lệ. Dọn fixture sau kiểm thử.
