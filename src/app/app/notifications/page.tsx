import { z } from "zod";
import { markNotificationReadAction } from "@/app/app/notifications/actions";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

const notificationsSchema = z.array(z.object({
  id: z.string().uuid(),
  notification_type: z.string(),
  title: z.string(),
  body: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
}));

export default async function NotificationsPage() {
  const { supabase, user } = await requireCurrentUser("/app/notifications");
  const { data, error } = await supabase
    .from("notifications")
    .select("id, notification_type, title, body, read_at, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Could not load notifications", { code: error.code });
    throw new Error("Không thể tải thông báo.");
  }
  const notifications = notificationsSchema.safeParse(data);
  if (!notifications.success) {
    console.error("Notification query returned an invalid shape");
    throw new Error("Dữ liệu thông báo không hợp lệ.");
  }

  return (
    <section className="dashboard-content">
      <p className="eyebrow">CẬP NHẬT TÀI KHOẢN</p>
      <h1>Thông báo</h1>
      <p className="subpage-intro">
        Thông báo về lượt giữ chỗ và thay đổi trạng thái đặt sân.
      </p>
      {notifications.data.length === 0 ? (
        <section className="empty-state booking-empty">
          <h2>Chưa có thông báo</h2>
          <p>Thông tin mới sẽ xuất hiện tại đây.</p>
        </section>
      ) : (
        <div className="notification-list">
          {notifications.data.map((notification) => (
            <article
              className={`notification-card${notification.read_at ? "" : " notification-unread"}`}
              key={notification.id}
            >
              <div>
                <h2>{notification.title}</h2>
                <p>{notification.body}</p>
                <time>
                  {new Intl.DateTimeFormat("vi-VN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Ho_Chi_Minh",
                  }).format(new Date(notification.created_at))}
                </time>
              </div>
              {!notification.read_at && (
                <form action={markNotificationReadAction}>
                  <input name="notificationId" type="hidden" value={notification.id} />
                  <button className="signout-button" type="submit">Đánh dấu đã đọc</button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
