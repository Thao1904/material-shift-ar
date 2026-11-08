# Material Shift AR

Bạn cầm một khối hộp giấy trong tay và đưa trước camera iPhone. Khối hộp hiện ra thành **gỗ, đá marble, kim loại hoặc thạch cao trắng**. Khi bạn di chuyển hay xoay khối, vật liệu bám theo và đổi bằng một vệt quét từ dưới lên.

Project dùng **8th Wall Engine (Image Targets)** và **three.js**, theo cấu trúc của repo mẫu [8thwall/threejs-world-effects-example](https://github.com/8thwall/threejs-world-effects-example).

```
Khối giấy (6 marker in sẵn) → 8th Wall Image Target → three.js (vật liệu 3D) → Camera AR trực tiếp
                                                          Wood · Marble · Metal · White
```

Project có **hai chế độ**:

| Trang | Vật thể | Cách nhận diện |
|---|---|---|
| `index.html` | Khối giấy in 6 marker (mục 1 bên dưới) | 8th Wall Image Targets |
| `block.html` | **Khối gỗ trắng có 4 chấm đỏ ở góc mỗi mặt** | Bộ nhận diện chấm đỏ tự viết (mục 8), hai người cùng xem (mục 9) |

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

## 8. Chế độ khối gỗ chấm đỏ (`block.html`)

Dùng chính khối gỗ sơn trắng của bạn, không cần in marker. Mở `https://<tên-bạn>.github.io/material-shift-ar/block.html` trên điện thoại rồi bấm **Start camera**.

**Vì sao không dùng 8th Wall Image Target cho khối này?** Image Target cần một hình in có nhiều chi tiết. Một mặt trắng trơn với 4 chấm nhỏ không đủ điểm để 8th Wall nhận ra, nên trang này dùng bộ nhận diện riêng, chạy trên trình duyệt (`src/block/dots-core.js`).

**Cách nhận diện**, lặp lại mỗi khung hình:

1. Tìm các đốm đỏ nhỏ và tròn. Màu cam, màu da và các vệt sọc dài bị loại.
2. Thử các bộ 4 đốm tạo thành một tứ giác lồi mà **bên trong là màu trắng** (mặt gỗ). Bước này loại đồ màu đỏ ở xung quanh, ví dụ quả bóng đỏ hay vải sọc hồng.
3. So bộ 4 đốm với hai kiểu mặt: **mặt lớn** (hình vuông) và **mặt cạnh** (hình chữ nhật dài). Dùng homography để tính góc nghiêng, rồi giữ kiểu mặt cho ra phép xoay hợp lý nhất.
4. Vì mặt khối đối xứng, có nhiều đáp án hợp lệ. Code chọn đáp án gần với khung hình trước nhất để khối không bị giật.
5. Suy ra tâm khối: lùi vào trong một nửa độ dày (nếu thấy mặt lớn) hoặc một nửa chiều sâu (nếu thấy mặt cạnh).

Hai ảnh thật của khối nằm trong `tools/test/photos/`. Chạy `node tools/test/dots.test.mjs` để kiểm tra: ảnh mặt trên phải ra `top`, ảnh mặt bên phải ra `side`.

**Đo khối và nhập vào app.** Kích thước mặc định là 8 × 8 × 2 cm. Bấm **Calibrate** để nhập số đo bằng thước kẻ. Số đo được lưu trên điện thoại đó. Muốn đổi mặc định cho mọi người, sửa `src/block/config.js`.

| Ô | Đo gì |
|---|---|
| Width / Depth / Thickness | 3 cạnh của khối |
| Big face: dot to edge | từ tâm chấm đỏ đến mép gần nhất, trên mặt lớn |
| Side face: dot to short / long edge | trên mặt cạnh: từ tâm chấm đến mép ngắn (đứng) và mép dài (ngang) |
| Camera FOV | góc nhìn camera. Nếu vật liệu trông **to hơn** khối thật thì tăng, **nhỏ hơn** thì giảm |

**Để nhận diện tốt hơn:**

- Tô các chấm **đậm hơn và to hơn**, đường kính 6–8 mm, bằng bút dạ đỏ. Các chấm hồng nhạt trên mặt cạnh là chỗ dễ trượt nhất.
- Đừng để ngón tay che chấm. Cầm khối ở giữa các cạnh.
- Cầm cách điện thoại 20–40 cm, nơi đủ sáng, tránh nền đỏ hoặc hồng ngay sau khối.
- Bật **Debug** để xem: vòng xanh dương là các đốm đỏ tìm được, khung xanh lá là mặt đang dùng, kèm sai số và khoảng cách.

---

## 9. Hai người cùng xem một khối

Hai điện thoại cùng nhìn **một khối**, mỗi người từ góc của mình. Mỗi người tự chọn vật liệu, rồi chọn cách xem:

| Chế độ | Khối hiển thị |
|---|---|
| **Mine** | vật liệu của tôi |
| **Phone XX · …** | vật liệu người kia đang chọn, cập nhật realtime |
| **Mix** | **lớp chung**: hai vật liệu trộn thành từng mảng. Thanh trượt chỉnh tỉ lệ, và cả hai máy dùng chung tỉ lệ đó |

Ngoài ra, mỗi máy còn thấy **chiếc điện thoại của người kia** hiện đúng chỗ người đó đang đứng (khung màu kèm tên và vật liệu). Đây là cách nhanh nhất để kiểm tra hai hệ toạ độ đã khớp.

### Bước 1: Thêm chấm đen đánh dấu gốc

Mặt khối hình vuông với 4 chấm đỏ giống nhau, nên mỗi máy không biết góc nào là "góc 0". Nếu không đánh dấu, hai máy có thể xoay khối lệch nhau 90°, và lớp Mix sẽ không trùng nhau. Cách làm:

- Trên **mặt trên** của khối, chọn **một** chấm đỏ bất kỳ.
- Vẽ một **chấm đen tròn, đường kính khoảng 5 mm**, cách chấm đỏ đó **0,8 cm về phía tâm theo cả hai cạnh** (tức lệch chéo khoảng 1,1 cm).
- Để khối **nằm yên trên bàn, mặt có chấm đen hướng lên**.

App chỉ tin hướng của khối sau khi đã thấy chấm đen (trạng thái hiện *aligned*). Nếu bạn vẽ lệch so với 0,8 cm, chỉnh **Black mark: offset** trong Calibrate.

### Bước 2: Vào chung phòng

1. Máy A: bấm **Room → Create room**. App hiện mã 4 ký tự và một link.
2. Máy B: mở link đó, hoặc vào **Room** và gõ mã rồi bấm **Join**.
3. Cả hai hướng camera vào khối cho tới khi thấy *aligned*.
4. Mỗi người bấm chọn vật liệu, rồi dùng thanh **Mine / Phone XX / Mix** phía trên.

### Vuốt để chuyển lớp

Thứ tự lớp là **Mine ← Mix → người kia**, lớp chung nằm giữa hai người.

- **Kéo ngang màn hình:** một đường sáng chạy theo ngón tay. Ở một bên đường, khối vẫn là lớp hiện tại. Ở bên kia, khối đã hiện lớp tiếp theo, kèm tên lớp ở phía trên.
- **Thả tay quá 1/3 màn hình, hoặc vuốt nhanh,** thì chuyển lớp. Thả sớm hơn thì lớp trượt về chỗ cũ.
- **Giữ yên ngón tay** (không kéo) thì vẫn là xem khối thật như trước.
- **Khi chỉ có một máy,** vuốt sẽ đổi lần lượt các vật liệu của bạn.
- Thanh trượt Mix trên máy nào cũng đặt **vật liệu của mình ở bên trái**, kéo về phía vật liệu nào thì vật liệu đó chiếm nhiều hơn. Tỉ lệ vẫn dùng chung cho cả hai máy.

Đường chia được tạo bởi hai mặt phẳng cắt đi qua camera và đường thẳng dưới ngón tay (`scrubStart` / `scrubSet` / `scrubEnd` trong `src/material-shift.js`), nên đường chia luôn thẳng trên màn hình dù khối nghiêng thế nào.

### Cách hoạt động

- **Mốc chung là chính khối gỗ.** Mỗi máy tự tính vị trí của khối so với camera của nó. Mọi thứ chia sẻ (hoa văn Mix, vị trí điện thoại) đều tính theo toạ độ của khối: đơn vị cm, gốc ở tâm khối, các trục cố định nhờ chấm đen. Vì vậy dù đứng ở góc nào, hai người cũng thấy cùng một chỗ trên khối thật.
- **Hoa văn Mix** được tính bằng nhiễu 3D theo toạ độ khối (shader trong `src/material-shift.js`). Cả hai máy xếp hai vật liệu theo cùng một thứ tự, nên cùng một mảng sẽ là gỗ trên cả hai máy.
- **Đồng bộ** qua MQTT trên WebSocket (`src/block/room.js`):
  - `user/<id>`: tên và vật liệu của từng người, được giữ lại cho người vào sau.
  - `pose/<id>`: vị trí camera theo toạ độ khối, gửi 5 lần mỗi giây.

  Mặc định app dùng broker công khai `broker.emqx.io`, không cần tài khoản. Ai biết mã phòng đều vào được.
- **Muốn chạy broker riêng** (ví dụ khi Wi-Fi chặn broker công khai): chạy `npm run broker` trên máy tính, rồi mở `block.html?broker=ws://<IP-máy-tính>:8888` trên cả hai điện thoại (cùng mạng Wi-Fi). Lưu ý: GitHub Pages là HTTPS, nên điện thoại có thể chặn `ws://`. Khi đó chạy app bằng `npm run serve` qua ngrok, hoặc dùng broker có `wss://`.

### Để vật liệu ôm sát khối

- **Tự đo góc nhìn camera.** Lần đầu bạn mở app trên một máy, dòng trạng thái hiện *calibrating camera …%*. Cầm khối và **nghiêng từ từ theo nhiều hướng** sao cho mặt lớn hiện xiên. App dùng hình vuông 4 chấm để tính FOV thật của camera máy đó, rồi lưu lại. Muốn đo lại thì vào Calibrate → **Re-calibrate camera**. Nếu bạn tự gõ FOV, app sẽ dùng số đó và ngừng tự đo.
- **Dùng mọi chấm nhìn thấy được.** Khi đã có vị trí từ 4 chấm của một mặt, app tìm thêm các chấm trên mặt bên rồi tinh chỉnh lại (Gauss-Newton trên sai số chiếu). Nhờ vậy độ dày và các cạnh khớp hơn.
- **Không bị trôi.** Hình camera trên màn hình chính là khung hình app vừa phân tích, nên vật liệu không bị lệch khỏi khối khi bạn di chuyển.
- **Làm mượt thích ứng:** khối đứng yên thì vật liệu mượt, khối di chuyển thì vật liệu bám theo gần như tức thì.
- **Nên đo bằng thước** khoảng cách từ chấm đến mép (Calibrate). Đây là phần còn lại khiến cạnh có thể lệch vài mm.

### Độ chính xác cần biết

- Sai lệch thường **dưới 1 cm** ở trên khối, và tăng dần khi đi ra xa khối.
- Hai máy phải nhập **cùng số đo khối**, và mỗi máy nên chỉnh **Camera FOV** cho đúng với camera của mình.
- Nếu khối bị che hoặc mất khỏi khung hình quá 1,5 giây, máy cần thấy lại chấm đen thì mới *aligned* trở lại.

**Test:** `npm test` kiểm tra phép tính vị trí, nhận diện trên ảnh thật, và chấm đen ở 4 góc xoay. Bài test hai máy (hai trình duyệt có camera giả cùng một broker nội bộ) xác nhận các điểm sau:
- cả hai máy đều aligned,
- máy A thấy vật liệu B chọn,
- lớp Mix giống nhau trên cả hai máy,
- thanh trượt đồng bộ,
- hai máy trao đổi được vị trí camera.

---

## Tài liệu tham khảo

- [8th Wall: Image Targets guide](https://8thwall.org/docs/engine/guides/image-targets)
- [8th Wall: Self-hosted engine](https://8thwall.org/docs/migration/self-hosted)
- [@8thwall/image-target-cli](https://www.npmjs.com/package/@8thwall/image-target-cli)
- [8thwall/threejs-world-effects-example](https://github.com/8thwall/threejs-world-effects-example)

8th Wall Engine Binary dùng theo giấy phép giới hạn của 8th Wall. Xem [Permitted Use FAQ](https://8thwall.org/docs/migration/faq).
