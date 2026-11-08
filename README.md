# Material Shift AR

Bạn cầm một khối hộp giấy trong tay và đưa trước camera iPhone. Khối hộp hiện ra thành **gỗ, đá marble, kim loại hoặc thạch cao trắng**. Khi bạn di chuyển hay xoay khối, vật liệu bám theo và đổi bằng một vệt quét từ dưới lên.

Project dùng **8th Wall Engine (Image Targets)** và **three.js**, theo cấu trúc của repo mẫu [8thwall/threejs-world-effects-example](https://github.com/8thwall/threejs-world-effects-example).

```
Khối giấy (6 marker in sẵn) → 8th Wall Image Target → three.js (vật liệu 3D) → Camera AR trực tiếp
                                                          Wood · Marble · Metal · White
```

---

## 0. Cần chuẩn bị

| Thứ | Ghi chú |
|---|---|
| Máy tính có Node.js 20 trở lên | `node -v` để kiểm tra |
| iPhone (Safari) hoặc Android (Chrome) | trình duyệt cần được dùng camera |
| Máy in, giấy **mờ** (matte), kéo, keo | giấy bóng phản sáng làm mất tracking |
| Tài khoản GitHub (để có link HTTPS) | hoặc dùng ngrok |

---

## 1. In và gấp khối hộp

Mở `print/material-shift-cube.pdf`.

- **Trang 1:** khai triển khối lập phương **6 cm** trên một tờ A4 (in giấy Letter cũng vừa).
- **Trang 2–4:** sáu mặt **10 cm** để dán lên một hộp carton lập phương 10 cm, nếu bạn muốn khối to và cứng hơn.

Khi in:

1. Chọn **Actual size / 100%**. **Không** chọn "Fit to page".
2. Đo thanh đen ở góc trang: nó phải dài đúng **50 mm**.
3. Cắt theo đường liền, gấp vào trong theo đường đứt, dán các tab xám vào mặt trong.
4. Giữ mặt phẳng và góc vuông. Mặt bị cong sẽ làm vật liệu lệch.

> **Quy tắc bắt buộc:** chiều cao của marker (phần hình in, không tính hai dải đen hai bên) phải **bằng cạnh của khối**, và marker nằm **chính giữa mặt, đúng chiều mũi tên**. Code dựa vào quy tắc này để tính vị trí tâm khối. Nếu bạn tự dán lên hộp khác, cứ giữ đúng quy tắc này là chạy.

Chiều mũi tên trên từng mặt:

| Mặt | Mũi tên ↑ chỉ về |
|---|---|
| Front, Right, Back, Left | mặt **Top** |
| Top | mặt **Back** |
| Bottom (chữ D) | mặt **Front** |

Nếu in trang 1 và gấp theo khai triển thì các mặt tự động đúng chiều.

---

## 2. Chạy thử trên máy tính (không cần camera)

```bash
npm install
npm run serve
```

Mở `http://localhost:5173/?preview`. Khối hộp đặt trên bàn để bạn:

- kéo chuột để xoay góc nhìn,
- bấm **Wood / Marble / Metal / White** để xem vệt quét đổi vật liệu,
- bật **Tip to shift** rồi bấm phím ↑ ↓ ← → để lật khối. Mỗi lần lật, vật liệu đổi sang cái tiếp theo.

Nếu mở trang mà không có `?preview`, máy tính sẽ hiện mã QR. Đó là trang Landing Page của 8th Wall, dùng để mở trên điện thoại.

---

## 3. Chạy trên iPhone

Điện thoại chỉ cho mở camera trên trang **HTTPS**. Có hai cách:

### Cách A: GitHub Pages (khuyên dùng)

1. Tạo repo mới trên GitHub và đẩy toàn bộ project lên (đã có `.gitignore` bỏ qua `node_modules` và `dist`).
2. Vào repo, chọn **Settings → Pages → Source: GitHub Actions**.
3. Mở tab **Actions** và đợi workflow *Deploy to GitHub Pages* hiện dấu xanh (khoảng 1 phút).
4. Mở `https://<tên-bạn>.github.io/<tên-repo>/` bằng Safari trên iPhone.

Từ đó, mỗi lần bạn `git push`, trang sẽ tự cập nhật.

### Cách B: ngrok (khi đang sửa code)

```bash
npm run serve          # cổng 5173
ngrok http 5173        # cho ra link https://xxxx.ngrok-free.dev
```

`vite.config.js` đã cho phép tên miền ngrok.

---

## 4. Dùng trong AR

1. Cho phép trang dùng camera.
2. Cầm khối cách điện thoại khoảng **20–40 cm**, chỗ đủ sáng. Đưa một mặt bất kỳ vào giữa màn hình.
3. Khi chấm trạng thái chuyển xanh (*Tracking · Front face*), khối hiện vật liệu.
4. Bấm các nút vật liệu ở dưới để đổi.
5. **Tip to shift:** bật nút này rồi lật khối 90° (ví dụ úp mặt Front lên trên). Mỗi lần lật, vật liệu đổi sang cái tiếp theo.
6. **Giữ ngón tay trên màn hình** để tạm ẩn vật liệu và nhìn khối giấy thật. Thả tay để hiện lại.
7. **Debug:** hiện khung xanh lá đặt đúng chỗ marker mà 8th Wall nhận ra, trục màu (đỏ X, xanh lá Y, xanh dương Z) và khung vàng của khối ảo. Dùng nút này khi vật liệu bị lệch.

---

## 5. Code chạy thế nào

```
index.html              nạp 8th Wall engine, XRExtras, Landing Page và giao diện
src/app.js              nạp dữ liệu 6 target, cấu hình XrController, thêm pipeline module
src/xr-module.js        nghe sự kiện reality.imagefound / imageupdated / imagelost
src/faces.js            6 mặt khối và phép tính "1 mặt → vị trí cả khối"
src/material-shift.js   khối ảo, chọn mặt tốt nhất, làm mượt, vệt quét, Tip to shift
src/materials.js        vẽ texture gỗ, marble, kim loại, thạch cao bằng code (PBR)
src/preview.js          chế độ xem trên máy tính (?preview)
public/image-targets/   dữ liệu target do @8thwall/image-target-cli tạo
tools/                  script tạo marker, PDF và dữ liệu target; test phép tính
print/                  PDF để in và ảnh từng mặt
```

**Bước 1: Image Targets.** Mỗi mặt khối là một image target riêng (`face-front`, `face-right`, …). Trong `app.js`:

```js
XR8.XrController.configure({
  imageTargetData,            // 6 file JSON trong public/image-targets/
  disableWorldTracking: true, // khối di chuyển, không cần quét phòng
})
```

**Bước 2: Nhận vị trí.** Mỗi khung hình, 8th Wall gửi `detail.position`, `detail.rotation` và `detail.scale` cho từng mặt đang thấy. Ảnh target nằm trên mặt phẳng XY của nó, trục Z hướng ra ngoài, và cạnh dài của ảnh bằng `1 × scale`.

**Bước 3: Từ 1 mặt suy ra cả khối** (`faces.js`). Vì marker cao bằng cạnh khối:

```
tâm khối   = vị_trí_mặt + xoay_mặt × (0, 0, −0.5 × scale)
xoay khối  = xoay_mặt × (hướng_mặt_trong_khối)⁻¹
cạnh khối  = scale
```

Khi nhìn thấy nhiều mặt cùng lúc, code chọn mặt đang **nhìn thẳng vào camera nhất**, vì mặt đó cho kết quả ổn định nhất. Sau đó code làm mượt vị trí để khối không bị rung. Chạy `node tools/test/pose.test.mjs` để kiểm tra rằng cả 6 mặt đều cho ra cùng một vị trí khối.

**Bước 4: Vật liệu.** Bốn vật liệu dùng `MeshPhysicalMaterial` với texture vẽ bằng code:

- gỗ có vân và lớp phủ bóng nhẹ,
- marble có gân và clearcoat,
- kim loại xước có anisotropy,
- thạch cao trắng mờ.

Ánh sáng môi trường lấy từ `RoomEnvironment`. Đèn chính đi theo người nhìn, và độ sáng chỉnh theo ước lượng ánh sáng của 8th Wall nếu có.

**Bước 5: Vệt quét.** Khi đổi vật liệu, khối hiện hai lớp: lớp cũ bị cắt từ dưới lên, lớp mới hiện từ dưới lên, ranh giới là một mặt phẳng cắt (clipping plane) chạy dọc trục Y của khối. Một vòng sáng chạy theo ranh giới đó.

---

## 6. Tuỳ biến

| Muốn | Làm |
|---|---|
| Dùng marker hình của riêng bạn | Thay ảnh trong `tools/markers/face-*.png` (tỉ lệ 3:4, đủ chi tiết, tương phản cao), rồi chạy `npm run targets` |
| Tạo lại marker và PDF | `npm run markers` rồi `npm run targets` (cần Python 3 có Pillow) |
| Tạo target thủ công | `npx @8thwall/image-target-cli@latest` → chọn `flat` → `default crop` → thư mục `public/image-targets` → đặt tên `face-front`, … |
| Thêm vật liệu | Thêm một mục vào mảng trả về trong `src/materials.js`. Nút bấm tự xuất hiện |
| Khối mượt hơn hoặc nhạy hơn | Đổi `SMOOTHING` trong `src/material-shift.js` (nhỏ hơn là mượt hơn) |
| Che mép giấy kỹ hơn | Đổi `COVER` (mặc định 1.03, tức to hơn khối thật 3%) |

---

## 7. Gỡ lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Không nhận khối | Thêm ánh sáng, dùng giấy mờ, đưa mặt vào giữa màn hình, đừng để quá gần (dưới 15 cm) |
| Vật liệu nhấp nháy khi xoay | Xoay chậm hơn, giữ cho luôn có một mặt hướng về camera. Có thể giảm `SMOOTHING` |
| Vật liệu lệch hoặc xoay sai 90° | Bật **Debug**. Nếu khung xanh lá nằm đúng trên marker mà khung vàng lệch, kiểm tra chiều dán của mặt đó (mục 1) hoặc giá trị `right` / `up` của mặt đó trong `src/faces.js` |
| Khối ảo to hoặc nhỏ hơn khối thật | Marker in sai tỉ lệ: in lại ở 100%, hoặc kiểm tra marker có cao bằng cạnh khối không |
| Bàn tay bị vật liệu che | Đây là giới hạn của bản thử: AR chưa biết bàn tay nằm trước khối. Cầm khối ở các cạnh dưới |
| Trên máy tính chỉ thấy mã QR | Đúng như thiết kế. Dùng `?preview` để xem trên máy tính |

---

## Tài liệu tham khảo

- [8th Wall: Image Targets guide](https://8thwall.org/docs/engine/guides/image-targets)
- [8th Wall: Self-hosted engine](https://8thwall.org/docs/migration/self-hosted)
- [@8thwall/image-target-cli](https://www.npmjs.com/package/@8thwall/image-target-cli)
- [8thwall/threejs-world-effects-example](https://github.com/8thwall/threejs-world-effects-example)

8th Wall Engine Binary dùng theo giấy phép giới hạn của 8th Wall. Xem [Permitted Use FAQ](https://8thwall.org/docs/migration/faq).
