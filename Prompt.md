Tôi muốn tạo một website để luyện nghe chép tiếng Anh
+ host toàn bộ trên aws, kiến trúc serverless, dùng terraform
+ backend dùng python
+ trang đăng nhập hoặc đăng ký, chỉ cần nhập email, nhấn nút đăng nhập hoặc đăng ký, thì gửi mã otp về email, nhập đúng otp thì vào, tự động xử lý trường hợp tài khoản mới hoặc tài khoản đã đăng nhập trước đó, cứ đúng otp là vào thôi
+ page có nhiều menu
+ menu đầu tiên là luyện tập, ở đây show ra tất cả các bài để luyện tập, bài do mình tự tạo thì ở phần trên, bài do người khác đóng góp thì ở phía dưới, các bài đóng góp thì cũng liệt kê rõ vào phần của người đóng góp
++ mỗi bài sẽ có tên bài, số câu trong bài, số lần đã luyện (có một ngôi sao thay đổi theo màu sắc để biểu thị số lần này)
++ mỗi lần vào học thì lưu lại trạng thái học đến câu nào để lần sau mở ra là đúng đến chỗ cũ, nếu học xong câu cuối thì tăng số lần đã luyện lên
+ click vào mội bài để luyện thì sang màn luyện tập của riêng bài đó, màn này có 2 tab
++ tab1 là để luyện nghe chép chính tả từng câu một. có nút để replay (hoặc nhấn ctrl để replay), user gõ xong sẽ nhấn enter để kiểm tra, nếu đúng cả câu rồi thì hiển thị chúc mừng và dịch nghĩa của câu, nhấn enter tiếp thì chuyển sang câu tiếp theo, nếu sai thì báo lỗi và gợi ý.
+++ Cách báo lỗi và gợi ý: đầu tiên hãy bỏ qua chuyện viết hoa, viết thường, thừa dấu cách, thiếu dấu gạch ngang, những cái được bỏ qua thì hãy chuẩn hóa đoạn người dùng đã viết cho giống target. thứ hai là kiểm tra từ trái qua phải, từng từ một, bắt đầu sai ở từ nào thì hiện gợi ý của từ đó, đưa con trỏ về đúng đến cuối từ đó để người dùng có thể nhấn backspace và sửa ngay. thứ 3 là nếu câu người dùng gõ không sai từ nào, nhưng bị thiếu, thì gợi ý từ tiếp theo
++ tab2 là để nghe full và xem transcript, đoạn full này thực ra là ghép tất cả các câu lại thôi => đọc đến câu nào thì highlight câu đó
+ menu thứ 2 là để tạo bài học, vào trang này để bắt đầu tạo một bài học
++ có một nút để upload audio, up xong thì có nút pause/play cho audio đó
++ có một dấu cộng để thêm câu, thêm câu thì tạo ra 2 ô, ô bên trái nhập thời điểm bắt đầu và thời điểm kết thúc, ô bên phải nhập transcript, có nút play/pause cho mỗi câu (trích xuất đúng thời điểm trong audio ra để play)
++ mặc định thêm câu thì thời điểm start là thời điểm kết thúc của câu trước, nếu là câu đầu tiên thì thời điểm start là 00:00, nếu có thể thì để thời gian ở mức chi tiết hơn 00:00.00 => phút:giây:phần giây
++ có ô để nhập dịch nghĩa của transcript
++ có ô nhập tiêu đề bài luyện tập 
++ có nút x để xóa một câu
++ nhấn tạo để tạo, nhấn reset để reset về trang trống

+ phải thiết kế làm sao cho trải nghiệm mượt mà, không giật lag, không lỗi
+ cần thêm trao đổi ý kiến hoặc quyết định gì thì hỏi tôi trước khi bắt tay vào làm

